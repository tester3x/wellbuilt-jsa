const {test}=require('node:test'),assert=require('node:assert/strict');
const {allowed}=require('./guided-audit/networkPolicy.cjs');
test('audit consume body satisfies the actual backend parser',()=>{
 const {parseConsumeInput}=require('C:/dev/dashboard-current-20261004/functions/lib/jsaReceipt/jsaReceiptCore.js');
 const {consumeBody}=require('./guided-audit/consumeBody.cjs');
 assert.equal(parseConsumeInput(consumeBody('A'.repeat(43))).ok,true);
 assert.equal(parseConsumeInput({...consumeBody('A'.repeat(43)),jobRef:'extra'}).ok,false);
});
test('guided native network boundary accepts only the three forwarded emulator ports',()=>{
 for(const port of [8789,9299,5001])assert.equal(allowed(`http://127.0.0.1:${port}/test`),true);
 for(const value of ['https://wellbuilt-sync.cloudfunctions.net/test','http://127.0.0.1.evil:5001/','http://127.0.0.1:5001@evil/','http://localhost:5001/','http://192.168.1.1:5001/','http://127.0.0.1:8183/','https://127.0.0.1:5001/',null,{}])assert.equal(allowed(value),false);
});
