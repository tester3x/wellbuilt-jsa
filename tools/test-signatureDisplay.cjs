const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {PNG}=require('pngjs');
const exportsForTest={};
new Function('exports','require',ts.transpileModule(fs.readFileSync('services/signatureDisplay.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exportsForTest,require);
const {signatureNeedsBlackInk,signatureImageCss}=exportsForTest;
function fixture(transparent,ink,filterType){
  const png=new PNG({width:40,height:12});
  for(let i=0;i<png.data.length;i+=4){png.data[i]=png.data[i+1]=png.data[i+2]=255;png.data[i+3]=transparent?0:255;}
  for(let x=4;x<36;x++){const i=(5*40+x)*4;png.data[i]=png.data[i+1]=png.data[i+2]=ink;png.data[i+3]=255;}
  return 'data:image/png;base64,'+PNG.sync.write(png,{filterType}).toString('base64');
}
for(const filter of [0,1,2,3,4]){
  for(const ink of [0,255]){
    const image=fixture(true,ink,filter),unchanged=image;
    assert.equal(signatureNeedsBlackInk(image),true,'transparent background, filter '+filter);
    assert.equal(signatureImageCss(image),'background:transparent;filter:brightness(0)');
    assert.equal(image,unchanged);
  }
  const opaque=fixture(false,0,filter);
  assert.equal(signatureNeedsBlackInk(opaque),false,'opaque white background, filter '+filter);
  assert.equal(signatureImageCss(opaque),'background:#fff;filter:none');
  assert.equal(signatureNeedsBlackInk(opaque.replace(/^data:image\/png;base64,/,'')),false);
}
for(const image of [null,undefined,'','bad','data:image/png;base64,aGVsbG8='])assert.equal(signatureNeedsBlackInk(image),false);
console.log('Signature rendering: transparent light/dark ink and opaque white canvases, all five PNG row filters, malformed input and immutable source passed.');
