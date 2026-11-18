import {unzlibSync} from 'fflate';

const cache = new Map<string, boolean>();
const paeth = (a:number,b:number,c:number) => {
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
};

/** Display only: older signatures have light ink on an empty transparent canvas.
 * Opaque white canvases must never be tinted (that would make a black rectangle).
 * Inspect pixels, not merely PNG's RGBA header: both capture formats use RGBA.
 * Unknown/malformed formats retain their original appearance. No image is saved.
 */
export function signatureNeedsBlackInk(image: string | null | undefined): boolean {
  if (!image || image.length>6_000_000) return false;
  const cached=cache.get(image);if(cached!==undefined)return cached;
  let result=false;
  try {
    const bytes=Uint8Array.from(atob(image.replace(/^data:image\/png;base64,/, '').replace(/\s/g,'')),c=>c.charCodeAt(0));
    const view=new DataView(bytes.buffer);
    if(view.getUint32(0)!==0x89504e47||view.getUint32(4)!==0x0d0a1a0a)throw Error('Not PNG');
    const width=view.getUint32(16),height=view.getUint32(20),type=bytes[25];
    if(!width||!height||width*height>2_000_000||bytes[24]!==8||bytes[28]!==0||![4,6].includes(type))throw Error('Unsupported PNG');
    const channels=type===6?4:2,stride=width*channels,parts:Uint8Array[]=[];
    for(let pos=8;pos+12<=bytes.length;){
      const length=view.getUint32(pos);if(pos+12+length>bytes.length)throw Error('Invalid PNG');
      if(view.getUint32(pos+4)===0x49444154)parts.push(bytes.subarray(pos+8,pos+8+length));
      pos+=length+12;
    }
    const compressed=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
    for(const part of parts){compressed.set(part,offset);offset+=part.length;}
    const raw=unzlibSync(compressed,{out:new Uint8Array((stride+1)*height)});
    if(raw.length!==(stride+1)*height)throw Error('Invalid scanlines');
    let previous=new Uint8Array(stride),transparent=0;
    for(let y=0;y<height;y++){
      const start=y*(stride+1),filter=raw[start],row=new Uint8Array(stride);
      if(filter>4)throw Error('Invalid filter');
      for(let x=0;x<stride;x++){
        const left=x>=channels?row[x-channels]:0,up=previous[x],corner=x>=channels?previous[x-channels]:0;
        row[x]=(raw[start+1+x]+(filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner)))&255;
      }
      for(let x=channels-1;x<stride;x+=channels)if(row[x]<32)transparent++;
      previous=row;
    }
    result=transparent>width*height/2;
  } catch { /* Never block a report because its signature cannot be inspected. */ }
  if(cache.size>=16)cache.delete(cache.keys().next().value!);
  cache.set(image,result);return result;
}

export function signatureImageCss(image: string | null | undefined): string {
  return signatureNeedsBlackInk(image)?'background:transparent;filter:brightness(0)':'background:#fff;filter:none';
}
