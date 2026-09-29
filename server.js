const http=require('node:http');
const fs=require('node:fs');
const page=fs.readFileSync(__dirname+'/index.html');
const server=http.createServer((req,res)=>{
 if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');}
 if(req.url!=='/' && !req.url.startsWith('/?')){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(page);
});
server.listen(Number(process.env.PORT)||8080,'0.0.0.0');
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
