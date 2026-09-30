import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'd42362d5-b0ec-4725-bc5f-655cc832bd62';
const BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/';
const modes = {
  graph_read: 'offline_access https://graph.microsoft.com/Mail.Read',
  graph_send: 'offline_access https://graph.microsoft.com/Mail.Send',
  graph_both: 'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send',
  imap: 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All',
  smtp: 'offline_access https://outlook.office.com/SMTP.Send',
  mail: 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send'
};
const assets = Object.fromEntries([['/','index.html','text/html'],['/app.js','app.js','text/javascript'],['/style.css','style.css','text/css']].map(([url,file,type])=>[url,{body:readFileSync(new URL('./public/'+file,import.meta.url)),type}]));
const errorMessages = {
  unauthorized_client:'This app must support personal Microsoft accounts and allow public client flows. Check Authentication in the Azure app registration.',
  invalid_client:'Enable Allow public client flows in the app registration. This device-code flow does not use a client secret.',
  invalid_scope:'Microsoft rejected the permissions. Check that the selected permissions are supported by this app.',
  authorization_declined:'You declined access. Start again when you are ready.',
  access_denied:'Microsoft denied access. Check your account and application settings.',
  expired_token:'The sign-in code expired. Start again to get a new code.',
  bad_verification_code:'This sign-in session is no longer valid. Start again.',
  invalid_grant:'The authorization is no longer valid. Start again.'
};
export function createApp(upstream = fetch) {
  let windowStart=Date.now(), starts=0, polls=0;
  return http.createServer(async (req,res)=>{
    const headers={
      'Cache-Control':'no-store, max-age=0','Pragma':'no-cache',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
      'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Strict-Transport-Security':'max-age=31536000'
    };
    const send=(status,data,type='application/json')=>{res.writeHead(status,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(type==='application/json'?JSON.stringify(data):data);};
    if(req.method==='GET' && req.url==='/healthz') return send(200,{ok:true});
    if(req.method==='GET' && req.url==='/api/config') return send(200,{clientId:CLIENT_ID});
    if(req.method==='GET' && assets[req.url]) {const a=assets[req.url];return send(200,a.body,a.type);}
    if(req.method!=='POST' || !['/api/start','/api/poll'].includes(req.url)) return send(404,{error:'not_found'});
    // Browser calls must originate from this page; no cookies, CORS, or cross-origin requests.
    let origin;
    try {origin=new URL(req.headers.origin);} catch {return send(403,{error:'origin_required'});}
    if(origin.host!==req.headers.host || !['https:','http:'].includes(origin.protocol) ||
      (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin') ||
      req.headers['x-token-ui']!=='1') return send(403,{error:'origin_rejected'});
    if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'json_required'});
    if(Date.now()-windowStart>60000){windowStart=Date.now();starts=0;polls=0;}
    if((req.url==='/api/start'?++starts>30:++polls>600)) return send(429,{error:'rate_limited',message:'Too many requests. Wait a minute and try again.'});
    try {
      let raw='';
      for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)return send(413,{error:'request_too_large'});}
      let body;
      try {body=JSON.parse(raw);}catch{return send(400,{error:'invalid_json'});}
      if(!body || typeof body!=='object') return send(400,{error:'invalid_request'});
      const start=req.url==='/api/start';
      if(start && !Object.hasOwn(modes,body.mode))return send(400,{error:'invalid_mode'});
      if(!start && (typeof body.deviceCode!=='string'||body.deviceCode.length<10||body.deviceCode.length>12000))return send(400,{error:'invalid_device_code'});
      const params=new URLSearchParams({client_id:CLIENT_ID,...(start?{scope:modes[body.mode]}:{grant_type:'urn:ietf:params:oauth:grant-type:device_code',device_code:body.deviceCode})});
      const response=await upstream(BASE+(start?'devicecode':'token'),{method:'POST',body:params,signal:AbortSignal.timeout(15000),redirect:'error'});
      const data=await response.json();
      if(data.error){
        if(['authorization_pending','slow_down'].includes(data.error))return send(200,{status:data.error});
        return send(400,{error:data.error,message:errorMessages[data.error]||'Microsoft could not complete the request. Check the app settings and try again.',codes:data.error_codes||[]});
      }
      if(!response.ok)return send(502,{error:'upstream_error',message:'Microsoft is temporarily unavailable. Try again shortly.'});
      if(start){
        const verify=new URL(data.verification_uri);
        if(verify.protocol!=='https:'||!['microsoft.com','www.microsoft.com','login.microsoftonline.com'].includes(verify.hostname))throw new Error('unexpected verification URL');
        return send(200,{deviceCode:data.device_code,userCode:data.user_code,verificationUri:verify.href,expiresIn:data.expires_in,interval:Math.max(5,data.interval||5)});
      }
      if(typeof data.refresh_token!=='string')return send(400,{error:'missing_refresh_token',message:'Microsoft did not return a refresh token. Start again with offline access.'});
      // Return only what the user needs. No logs, disk writes, server-side sessions, or token database.
      return send(200,{status:'complete',refreshToken:data.refresh_token,scope:data.scope||''});
    }catch{return send(502,{error:'connection_error',message:'Could not reach Microsoft. Start a new sign-in if this continues.'});}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const server=createApp();
  server.requestTimeout=20000;
  server.listen(Number(process.env.PORT||8080),'0.0.0.0');
  process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
}
