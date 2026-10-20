const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
(async()=>{
 let callback,resolve,refreshes=0,removed=0;
 const native={addListener:(_,cb)=>{callback=cb;return {remove(){removed++;}};},connectionState:()=>new Promise(r=>{resolve=r;})};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('services/jsaViewReconnect.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(()=>native,m,m.exports);
 const stop=m.exports.subscribeJsaViewReconnect(()=>refreshes++);resolve({reachable:true});await Promise.resolve();assert.equal(refreshes,0);
 callback({reachable:false});callback({reachable:true});assert.equal(refreshes,1);callback({reachable:true});assert.equal(refreshes,1);
 callback({reachable:false});callback({reachable:true});assert.equal(refreshes,2);stop();callback({reachable:true});assert.equal(refreshes,2);assert.equal(removed,1);
 const stopAgain=m.exports.subscribeJsaViewReconnect(()=>refreshes++);callback({reachable:true});assert.equal(refreshes,3);resolve({reachable:false});await Promise.resolve();callback({reachable:true});assert.equal(refreshes,3,'stale initial read must not reset a newer online event');stopAgain();
 console.log('Cached view reconnect: one refresh per recovery, no online polling, stale initial reads and cleanup fenced.');
})().catch(e=>{console.error(e);process.exitCode=1;});
