import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp,CLIENT_ID} from './server.mjs';

test('isolated device sessions, constrained proxy, and no-store responses',async()=>{
  const seen=[];
  const mock=async(url,opts)=>{
    seen.push({url,params:Object.fromEntries(opts.body)});
    assert.equal(opts.body.get('client_id'),CLIENT_ID);
    if(url.endsWith('/devicecode'))return Response.json({device_code:'test-device-code-A',user_code:'TEST123',verification_uri:'https://www.microsoft.com/devicelogin',expires_in:900,interval:5});
    const device=opts.body.get('device_code');
    if(device==='test-device-code-A')return Response.json({error:'authorization_pending'}, {status:400});
    if(device==='test-device-code-B')return Response.json({refresh_token:'test-only-token-B',access_token:'not-forwarded',scope:'Mail.Read'});
    return Response.json({error:'expired_token',error_description:'Sensitive untrusted upstream detail'}, {status:400});
  };
  const server=createApp(mock);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root='http://127.0.0.1:'+server.address().port;
  const post=(path,body,extra={})=>fetch(root+path,{method:'POST',headers:{Origin:root,'Content-Type':'application/json','X-Token-UI':'1',...extra},body:JSON.stringify(body)});
  try{
    const page=await fetch(root);assert.equal(page.status,200);assert.match(page.headers.get('cache-control'),/no-store/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal((await post('/api/start',{mode:'graph_read'},{Origin:'https://evil.example'})).status,403);
    assert.equal((await post('/api/start',{mode:'anything'})).status,400);
    assert.equal(seen.length,0);
    let r=await post('/api/start',{mode:'graph_read'});assert.equal(r.status,200);assert.equal((await r.json()).userCode,'TEST123');assert.match(seen[0].params.scope,/offline_access/);
    r=await post('/api/poll',{deviceCode:'test-device-code-A'});assert.equal((await r.json()).status,'authorization_pending');
    r=await post('/api/poll',{deviceCode:'test-device-code-B'});let data=await r.json();assert.equal(data.refreshToken,'test-only-token-B');assert.equal(data.access_token,undefined);
    r=await post('/api/poll',{deviceCode:'test-device-code-A'});assert.equal((await r.json()).refreshToken,undefined);
    r=await post('/api/poll',{deviceCode:'test-device-code-C'});data=await r.json();assert.equal(data.error,'expired_token');assert.equal(data.error_description,undefined);
    assert.equal((await fetch(root+'/api/poll?deviceCode=test-device-code-B')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
