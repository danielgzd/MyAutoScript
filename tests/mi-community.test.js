const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../scripts/loon-mi-community-checkin.js'),'utf8');
const cookie='wx_vip_serviceToken=synthetic-private-token; wx_vip_ph=synthetic-ph==; userId=synthetic-user';
const url='https://api.vip.miui.com/mtop/planet/wechat/checkin/mypagedata?wx_vip_ph=synthetic-ph';
const req={url,headers:{Cookie:cookie,Origin:'https://servicewechat.com',Referer:'https://servicewechat.com/fake-app/77/page-frame.html','User-Agent':'synthetic-agent'}};
function page(signed,growth){return {data:[{title:'每日签到',buttons:[{button:signed?'已签到':'去签到',showType:signed?0:1}]},{title:'成长值',jumpText:growth}]};}
const response=value=>({status:200,body:JSON.stringify({status:200,message:'success',entity:value})});
function execute(initial={},request=null,reply=null,server=null,argument='mode=manual'){
 const data={...initial},notifications=[],logs=[],calls=[];let done;
 const finished=new Promise(resolve=>done=resolve);
 function network(method,opts,cb){
  assert.equal(opts.timeout,12000);assert.equal(opts['auto-cookie'],false);assert.equal(opts['auto-redirect'],false);
  const keys=Object.keys(opts.headers).map(x=>x.toLowerCase());for(const key of ['content-length','connection','host','accept-encoding'])assert(!keys.includes(key));
  calls.push({method,opts});if(server)server(method,opts,cb);else cb('unexpected-network');
 }
 const ctx={console:{log:x=>logs.push(x)},$persistentStore:{read:k=>data[k]??null,write:(v,k)=>(data[k]=v,true)},$notification:{post:(...x)=>notifications.push(x)},$done:()=>done(),$argument:argument,$httpClient:{get:(o,c)=>network('GET',o,c),post:(o,c)=>network('POST',o,c)}};
 if(request)ctx.$request=request;if(reply)ctx.$response=reply;
 vm.runInNewContext(source,ctx);
 return finished.then(()=>{assert(!logs.join('\n').includes('synthetic-private-token'));assert(!JSON.stringify(notifications).includes('synthetic-private-token'));return {data,notifications,logs,calls};});
}
function mockServer(options={}){
 const state={signed:!!options.signed,posts:0,growth:options.signed?'129/200':'126/200'};
 const server=(method,opts,cb)=>{
  assert(opts.url.startsWith('https://api.vip.miui.com/mtop/planet/wechat/'));
  assert(opts.url.includes('wx_vip_ph=synthetic-ph'));
  if(method==='GET'){
   if(options.authFailure)return cb(null,{status:200},'{"code":401}');
   if(options.html)return cb(null,{status:200},'<html>login</html>');
   const entity=options.unknown?{data:[{title:'新版页面'}]}:page(state.signed,state.growth);
   return cb(null,{status:200},JSON.stringify({status:200,entity}));
  }
  state.posts++;assert(opts.url.includes('/member/addCommunityGrowUpPointByActionV2?'));assert.equal(opts.body,'action=WECHAT_CHECKIN_TASK');
  if(!options.notSigned){state.signed=true;state.growth='129/200';}
  if(options.timeout)return cb({code:'TIMEOUT'});
  cb(null,{status:200},JSON.stringify({status:200,entity:{score:'3',desc:'小程序签到'}}));
 };
 return {server,state};
}
(async()=>{
 let passed=0;
 async function test(name,fn){await fn();passed++;}
 const captured=await execute({},req,response(page(false,'126/200')),null,'mode=capture');
 const base=captured.data;
 await test('capture padded cookie and unpadded query as a coherent pair',async()=>{const c=JSON.parse(base.gzd_mi_community_credentials);assert.equal(c.ph,'synthetic-ph');assert.equal(c.cookie,cookie);assert(c.headers.referer.includes('/77/'));assert(captured.notifications.length===1);});
 await test('401 does not overwrite valid credentials',async()=>{const x=await execute(base,req,{status:200,body:'{"code":401}'},null,'mode=capture');assert.equal(x.data.gzd_mi_community_credentials,base.gzd_mi_community_credentials);});
 await test('missing cookie or mismatched ph rejected',async()=>{for(const headers of [{}, {Cookie:cookie.replace('synthetic-ph','other-ph')}]){const x=await execute({}, {...req,headers},response(page(false,'126/200')),null,'mode=capture');assert(!x.data.gzd_mi_community_credentials);}});
 await test('unrelated host rejected',async()=>{const x=await execute({}, {...req,url:url.replace('api.vip.miui.com','evil.example')},response(page(false,'126/200')),null,'mode=capture');assert(!x.data.gzd_mi_community_credentials);});
 await test('encoded plus is preserved',async()=>{const x=await execute({}, {...req,url:url.replace('synthetic-ph','synthetic%2Bph'),headers:{Cookie:cookie.replace('synthetic-ph','synthetic+ph')}},response(page(false,'126/200')),null,'mode=capture');assert.equal(JSON.parse(x.data.gzd_mi_community_credentials).ph,'synthetic+ph');});
 await test('already signed never POSTs',async()=>{const s=mockServer({signed:true});const x=await execute(base,null,null,s.server);assert.equal(s.state.posts,0);assert(JSON.parse(x.data.gzd_mi_community_last_result).alreadySigned);assert(x.notifications[0].join('').includes('今日已签到'));});
 await test('verified sign reports observed reward and growth',async()=>{const s=mockServer();const x=await execute(base,null,null,s.server);assert.equal(s.state.posts,1);const result=JSON.parse(x.data.gzd_mi_community_last_result);assert.equal(result.status,'success');assert.equal(result.score,3);assert.equal(result.growth,'129/200');assert.equal(x.calls.length,3);});
 await test('HTTP 200 alone cannot report sign success',async()=>{const s=mockServer({notSigned:true});const x=await execute(base,null,null,s.server);assert.equal(JSON.parse(x.data.gzd_mi_community_last_result).status,'failure');});
 await test('timeout resolved by authoritative page',async()=>{const s=mockServer({timeout:true});const x=await execute(base,null,null,s.server);assert.equal(JSON.parse(x.data.gzd_mi_community_last_result).status,'success');assert.equal(JSON.parse(x.data.gzd_mi_community_last_result).score,null);assert.equal(s.state.posts,1);});
 await test('uncertain POST not blindly repeated',async()=>{const s=mockServer({timeout:true,notSigned:true});const x=await execute(base,null,null,s.server);await execute(x.data,null,null,s.server);assert.equal(s.state.posts,1);});
 await test('auth expiration produces failure and notification',async()=>{const s=mockServer({authFailure:true});const x=await execute(base,null,null,s.server);assert.equal(s.state.posts,0);assert.equal(JSON.parse(x.data.gzd_mi_community_last_result).status,'failure');assert(x.notifications[0].join('').includes('登录态已失效'));});
 await test('HTML and changed page reject without POST',async()=>{for(const opt of [{html:true},{unknown:true}]){const s=mockServer(opt);const x=await execute(base,null,null,s.server);assert.equal(s.state.posts,0);assert.equal(JSON.parse(x.data.gzd_mi_community_last_result).status,'failure');}});
 await test('manual repeats notify; scheduled identical result deduplicates',async()=>{const s=mockServer({signed:true});const a=await execute(base,null,null,s.server,'mode=cron');const b=await execute(a.data,null,null,s.server,'mode=cron');const c=await execute(b.data,null,null,s.server,'mode=manual');assert.equal(a.notifications.length,1);assert.equal(b.notifications.length,0);assert.equal(c.notifications.length,1);});
 await test('legacy paired keys migrate safely',async()=>{const s=mockServer({signed:true});const x=await execute({gzd_mi_community_header_Cookie:cookie,gzd_mi_community_url:url},null,null,s.server);assert(x.data.gzd_mi_community_credentials);assert.equal(s.state.posts,0);});
 await test('capture and notification test make no business request',async()=>{for(const mode of ['mode=capture','mode=notify-test']){const x=await execute({},null,null,null,mode);assert.equal(x.calls.length,0);assert.equal(x.notifications.length,1);}});
 console.log(passed+' Xiaomi check-in test groups passed; credentials absent from logs and notifications');
})();
