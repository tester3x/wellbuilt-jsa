const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const events={},frames=[];global.requestAnimationFrame=f=>{frames.push(f);return frames.length};global.cancelAnimationFrame=()=>{};
function flush(){while(frames.length)frames.shift()();}
const exportsObject={};
new Function('require','exports',ts.transpileModule(fs.readFileSync('components/useFormKeyboard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>{
 if(name==='react')return {useRef:v=>({current:v}),useState:v=>[v,()=>{}],useCallback:f=>f,useEffect:f=>f()};
 if(name==='react-native')return {Keyboard:{addListener:(name,f)=>{events[name]=f;return {remove(){}}}}};
 const ex={};new Function('exports',ts.transpileModule(fs.readFileSync('utils/keyboardRevealOffset.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(ex);return ex;
},exportsObject);
const hook=exportsObject.useFormKeyboard();let y=700,viewport=1000,focused=true,moved=null;
hook.scrollRef.current={getNativeScrollRef:()=>({measureInWindow:f=>f(0,100,400,viewport)}),scrollTo:v=>moved=v.y};
const input={isFocused:()=>focused,measureInWindow:f=>f(0,y,300,50)};
hook.focus(input,200);events.keyboardDidShow({endCoordinates:{screenY:650,height:450}});flush();assert.equal(moved,324);
viewport=500;moved=null;hook.reveal();flush();assert.equal(moved,374);
y=150;moved=null;hook.reveal();flush();assert.equal(moved,null);
focused=false;y=700;moved=null;hook.reveal();flush();assert.equal(moved,null);
console.log('4 form keyboard cases passed: overlay plus search results, native resize, already visible, stale focus.');
