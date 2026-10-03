// Validate the bounded still-WebP container and declared dimensions before storage.
// The desktop additionally decodes and re-encodes images to remove metadata.
export function validateWebp(bytes: Uint8Array): void {
  const fail=():never=>{throw new Error('Foto harus WebP statis, maksimal 1600 × 1600 piksel, tanpa metadata.');};
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const four=(offset:number)=>String.fromCharCode(...bytes.slice(offset,offset+4));
  if(bytes.length<26 || four(0)!=='RIFF' || four(8)!=='WEBP' || view.getUint32(4,true)!==bytes.length-8)fail();
  let offset=12, frames=0, canvas:string|undefined;
  const dimensions=(width:number,height:number)=>{if(width<1||height<1||width>1600||height>1600)fail();return `${width},${height}`;};
  while(offset<bytes.length){
    if(offset+8>bytes.length)fail();const tag=four(offset),size=view.getUint32(offset+4,true),data=offset+8,next=data+size+(size%2);
    if(next>bytes.length || (size%2 && bytes[data+size]!==0))fail();
    if(tag==='VP8X'){
      if(size!==10||offset!==12||(bytes[data]&~0x10)!==0||bytes[data+1]||bytes[data+2]||bytes[data+3])fail();
      const u24=(i:number)=>bytes[i]+bytes[i+1]*256+bytes[i+2]*65536;
      canvas=dimensions(u24(data+4)+1,u24(data+7)+1);
    }else if(tag==='VP8 '){
      if(size<10||(bytes[data]&1)!==0||bytes[data+3]!==0x9d||bytes[data+4]!==1||bytes[data+5]!==0x2a)fail();
      const sizeKey=dimensions(view.getUint16(data+6,true)&0x3fff,view.getUint16(data+8,true)&0x3fff);
      if(canvas && canvas!==sizeKey)fail();frames++;
    }else if(tag==='VP8L'){
      if(size<5||bytes[data]!==0x2f)fail();const bits=view.getUint32(data+1,true);if(bits>>>29)fail();
      const sizeKey=dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);
      if(canvas && canvas!==sizeKey)fail();frames++;
    }else if(tag==='ALPH'){if(!canvas||size<1||frames)fail();}
    else fail(); // No animation, EXIF, XMP, ICC, or arbitrary chunks.
    offset=next;
  }
  if(frames!==1)fail();
}
