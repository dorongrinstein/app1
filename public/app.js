const $=id=>document.getElementById(id);
let session=null,token='',pollTimer,clockTimer,clearTimer,generation=0,controller;
const notes={graph_read:'Read your mailbox through Microsoft Graph.',graph_send:'Send email through Microsoft Graph.',graph_both:'Read and send email through Microsoft Graph.',imap:'Read and manage your mailbox through IMAP.',smtp:'Send email through SMTP.',mail:'Read and manage your mailbox through IMAP, and send through SMTP.'};
function view(name){for(const n of ['setup','authorize','result'])$(n).hidden=n!==name;['setup','authorize','result'].forEach((n,i)=>$('step'+(i+1)).classList.toggle('active',n===name));}
function error(message){$('error').textContent=message;$('error').hidden=false;}
function clean(){generation++;controller?.abort();clearTimeout(pollTimer);clearInterval(clockTimer);clearTimeout(clearTimer);session=null;token='';$('token').value='';$('scopes').textContent='';$('userCode').textContent='';$('signIn').removeAttribute('href');$('error').hidden=true;$('notice').textContent='';$('reveal').textContent='Reveal';$('start').disabled=false;}
function reset(){clean();view('setup');}
async function api(path,body,signal){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Token-UI':'1'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',signal});const data=await response.json();if(!response.ok||data.error)throw new Error((data.message||data.error||'Request failed')+(data.codes?.length?' (AADSTS'+data.codes.join(', ')+')':''));return data;}
async function copy(value,label){try{await navigator.clipboard.writeText(value);$('notice').textContent=label+' copied.';}catch{$('notice').textContent='Clipboard access was blocked. Reveal and select the token, or select the sign-in code, to copy manually.';}}
function fail(message){clean();view('setup');error(message);}
async function poll(id){
  if(id!==generation||!session)return;
  if(Date.now()>=session.expiresAt)return fail('Your sign-in code expired. Generate a new code and try again.');
  try{
    const data=await api('/api/poll',{deviceCode:session.deviceCode},controller.signal);
    if(id!==generation)return;
    if(data.status==='complete'){
      clearInterval(clockTimer);session=null;token=data.refreshToken;$('token').value='•'.repeat(80);$('token').setAttribute('aria-label','Refresh token, hidden until revealed');$('scopes').textContent=data.scope||'Approved Microsoft permissions';view('result');$('notice').textContent='Token received. Copy it before closing this page.';
      clearTimer=setTimeout(()=>{reset();$('notice').textContent='Token cleared after 5 minutes. Start again if you need another.';},300000);return;
    }
    if(data.status==='slow_down')session.interval+=5;
    $('waitText').textContent='Waiting for your approval';
    pollTimer=setTimeout(()=>poll(id),session.interval*1000);
  }catch(e){if(id===generation)fail(e.message);}
}
$('mode').addEventListener('change',()=>{$('permissionNote').textContent=notes[$('mode').value]+' Offline access is included to obtain a refresh token.';});
$('start').addEventListener('click',async()=>{
  clean();const id=generation;controller=new AbortController();$('start').disabled=true;$('start').textContent='Getting your code…';
  try{
    const data=await api('/api/start',{mode:$('mode').value},controller.signal);
    if(id!==generation)return;
    session={...data,expiresAt:Date.now()+data.expiresIn*1000};$('userCode').textContent=data.userCode;$('signIn').href=data.verificationUri;view('authorize');
    const tick=()=>{if(!session)return;const seconds=Math.max(0,Math.ceil((session.expiresAt-Date.now())/1000));$('countdown').textContent='Code expires in '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' · Checking automatically';if(!seconds)fail('Your sign-in code expired. Generate a new code.');};
    tick();clockTimer=setInterval(tick,1000);pollTimer=setTimeout(()=>poll(id),session.interval*1000);
  }catch(e){if(id===generation)fail(e.message);}
  finally{$('start').textContent='Get sign-in code →';$('start').disabled=false;}
});
$('copyCode').addEventListener('click',()=>{if(session)copy(session.userCode,'Sign-in code');});
$('copyToken').addEventListener('click',()=>{if(token)copy(token,'Refresh token');});
$('reveal').addEventListener('click',()=>{const reveal=$('reveal').textContent==='Reveal';$('token').value=reveal?token:'•'.repeat(80);$('reveal').textContent=reveal?'Hide':'Reveal';$('token').setAttribute('aria-label',reveal?'Refresh token':'Refresh token, hidden until revealed');});
$('cancel').addEventListener('click',reset);$('clear').addEventListener('click',reset);
window.addEventListener('pagehide',clean);
window.addEventListener('pageshow',e=>{if(e.persisted)reset();});
fetch('/api/config',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{$('clientId').textContent=data.clientId;$('azureLink').href='https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/'+encodeURIComponent(data.clientId);$('start').disabled=false;}).catch(()=>error('Unable to load the application settings. Reload this page to try again.'));
