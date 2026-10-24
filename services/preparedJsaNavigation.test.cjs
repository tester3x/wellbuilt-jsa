const {test}=require('node:test');const assert=require('node:assert/strict');
const {preparedReadPosition:position,nextPreparedRead:next}=require('./preparedJsaNavigation');
const steps=[{id:'a'},{id:'b'},{id:'c'}];
const initial={stepAcks:{},prepared:{},ppeSelected:{boots:true},signature:'',printedName:'',notes:'draft note'};
test('sequential reads acknowledge only the displayed step before PPE and review',()=>{
 let d=initial;assert.equal(position(steps,d).screen,'steps');
 for(const id of ['a','b','c']){d=next(steps,d);assert.equal(d.stepAcks[id],true);assert.equal(Object.keys(d.stepAcks).length,['a','b','c'].indexOf(id)+1);}
 assert.equal(position(steps,d).screen,'ppe');assert.equal(position(steps,next(steps,d)).screen,'review');
 assert.equal(d.notes,'draft note');assert.deepEqual(d.ppeSelected,{boots:true});
});
test('a stale review marker cannot bypass missing required steps',()=>{
 const d={...initial,screen:'review',stepAcks:{a:true},stepIndex:1};
 assert.equal(position(steps,d).screen,'steps');assert.deepEqual(next(steps,d).stepAcks,{a:true,b:true});
});
test('existing one-page signed draft resumes review without losing entered evidence',()=>{
 const d={...initial,stepAcks:{a:true,b:true,c:true},signature:'image',printedName:'Name',prepared:{ready:true}};
 assert.equal(position(steps,d).screen,'review');assert.deepEqual(next(steps,d),d);
});
test('restart resumes the persisted step while constraining out-of-range positions',()=>{
 assert.equal(position(steps,{...initial,screen:'steps',stepIndex:100}).index,2);
 assert.equal(position(steps,{...initial,stepAcks:{a:true}}).index,1);
 assert.equal(position(steps,{...initial,screen:'invalid'}).screen,'steps');
});
