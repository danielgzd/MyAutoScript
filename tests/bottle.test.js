const fs=require('fs'), vm=require('vm'), assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname, '../scripts/loon-bottle-checkin.js'),'utf8');
const headers={app:'PINGXIN',accessToken:'test-private-token',mobileKey:'test-private-signature',time:String(Date.now()),udid:'test-device'};
function execute(initial,request,server,argument){
 const data={...initial},logs=[],notifications=[],calls=[];
 let finish;
 const promise=new Promise(resolve=>finish=resolve);
 const context={console:{log:x=>logs.push(x)},$persistentStore:{read:k=>data[k]??null,write:(v,k)=>(data[k]=v,true)},$notification:{post:(...x)=>notifications.push(x)},$done:()=>finish(),$httpClient:{post:(opts,cb)=>{calls.push(opts);assert.equal(opts.timeout,12000,'Loon HTTP timeout must be milliseconds');if(server)server(opts,cb);else cb('unexpected network');}}};
 if(request)context.$request=request;
 if(argument)context.$argument=argument;
 vm.runInNewContext(source,context);
 return promise.then(()=>({data,logs,notifications,calls}));
}
(async()=>{
 let manual=await execute({},null,null,'mode=capture');assert.equal(manual.calls.length,0);assert(manual.logs.some(x=>x.includes('这是请求捕获入口')));
 let x=await execute({}, {url:'http://pingxin-api.samaliong.top/member/memberInfo',headers,body:'{}'});
 assert.equal(JSON.parse(x.data.gzd_bottle_headers).accesstoken,headers.accessToken);
 assert(!JSON.stringify(x.logs).includes(headers.accessToken));
 assert(!JSON.stringify(x.notifications).includes(headers.accessToken));
 assert.equal(x.calls.length,0);
 x=await execute({}, {url:'https://pingxin-api.samaliong.top:443/member/memberInfo',headers,body:'{}'});
 assert.equal(x.data.gzd_bottle_api_base,'https://pingxin-api.samaliong.top:443');
 assert(x.data.gzd_bottle_capture_status.includes('完整凭证'));
 x=await execute({}, {url:'http://evil.example/member/memberInfo',headers,body:'{}'});assert(!x.data.gzd_bottle_headers);
 x=await execute({}, {url:'http://pingxin-api.samaliong.top/member/memberInfo',headers:{time:headers.time},body:'{}'});assert(!x.data.gzd_bottle_headers);
 x=await execute({gzd_bottle_headers:JSON.stringify({...headers,accesstoken:headers.accessToken.toString(),time:String(Date.now()-600000)})});assert.equal(x.calls.length,0);
 x=await execute({gzd_bottle:JSON.stringify({enabled:false}),gzd_bottle_headers:JSON.stringify(headers)});assert.equal(x.calls.length,0);
 // Capture produces lowercase headers; use precisely the stored form in cron tests.
 const captured=(await execute({}, {url:'http://pingxin-api.samaliong.top/member/memberInfo',headers,body:'{}'})).data;
 const state={coins:1000,points:0,signed:false,publish:0,greet:false,claimed2:false,claimed4:false};
 function server(opts,cb){
  const p=opts.url.replace('http://pingxin-api.samaliong.top','');let result;
  switch(p){
   case '/member/memberInfo':result={id:'synthetic-user',coinNum:state.coins,points:state.points};break;
   case '/fateMail/signInRecord':result={todayIsSignin:state.signed?1:0};break;
   case '/fateMail/signIn':state.signed=true;state.coins+=20;result={myCoin:state.coins};break;
   case '/fateMail/taskList':result={taskList:[{id:'2',target:'publish',title:`发布瓶子 ${state.publish}/3`,isComplete:state.claimed2?2:state.publish>=3?1:0},{id:'3',target:'reply',title:'回复瓶子 0/5',isComplete:0},{id:'4',target:'sendMessage',title:'一键打招呼',isComplete:state.claimed4?2:state.greet?1:0}]};break;
   case '/pingzi/reng':state.coins-=5;state.publish++;result={};break;
   case '/fateMail/sendChatToSomeBody':state.coins-=50;state.greet=true;result={};break;
   case '/fateMail/receiverRewards/2':assert(!state.claimed2);state.claimed2=true;state.points+=50;break;
   case '/fateMail/receiverRewards/4':assert(!state.claimed4);state.claimed4=true;state.points+=50;break;
   default:throw Error('unexpected endpoint '+p);
  }
  cb(null,{status:200},JSON.stringify({success:true,code:200,result}));
 }
 x=await execute({...captured,gzd_bottle_publish_template:JSON.stringify({s:'synthetic-encrypted-content'})},null,server);
 assert.equal(state.coins,955);assert.equal(state.points,100);assert.equal(state.publish,3);
 assert.equal(JSON.parse(x.data.gzd_bottle_ledger).reserved,65);
 assert(x.notifications.some(n=>n.join('').includes('缺少真实接口')));
 let after=await execute(x.data,null,server);
 assert.equal(state.coins,955);assert.equal(state.publish,3);
 // Lower budget must stop before spending 50 for greetings.
 state.coins=1000;state.publish=0;state.greet=false;state.claimed2=false;state.claimed4=false;
 x=await execute({...captured,gzd_bottle:JSON.stringify({daily_spend_limit:10}),gzd_bottle_publish_template:JSON.stringify({s:'synthetic'})},null,server);
 assert.equal(state.publish,2);assert(!state.greet);assert.equal(JSON.parse(x.data.gzd_bottle_ledger).reserved,10);
 // HTML or invalid JSON may never be considered success.
 x=await execute(captured,null,(_o,cb)=>cb(null,{status:200},'<html>error</html>'));
 assert(x.notifications.some(n=>n.join('').includes('不是有效 JSON')));
 assert(!x.data.gzd_bottle_completed);
 // If an operation times out, retrying cron must not send the same charge again.
 const st={coins:1000};let mutations=0;
 function timeoutServer(opts,cb){
  let p=opts.url.split('.top')[1];
  if(p==='/member/memberInfo')return cb(null,{status:200},JSON.stringify({success:true,code:200,result:{id:'synthetic-user',coinNum:1000,points:0}}));
  if(p==='/fateMail/signInRecord')return cb(null,{status:200},JSON.stringify({success:true,code:200,result:{todayIsSignin:1}}));
  if(p==='/fateMail/taskList')return cb(null,{status:200},JSON.stringify({success:true,code:200,result:{taskList:[{id:'4',target:'sendMessage',isComplete:0}]}}));
  mutations++;cb('timeout');
 }
 x=await execute(captured,null,timeoutServer);await execute(x.data,null,timeoutServer);assert.equal(mutations,1);
 console.log('9 offline groups passed: capture/privacy, host guard, empty credentials, stale/disabled, 65-coin task budget, no repeat charges, lower budget, invalid JSON, timeout reservation');
})();
