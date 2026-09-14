/** Coordinates are window-relative: handles both resized and overlay keyboards. */
export function keyboardRevealOffset(offset:number,fieldBottom:number,viewportBottom:number,keyboardTop:number):number {
  const visibleBottom=Math.min(viewportBottom,keyboardTop)-24;
  return Math.max(0,offset)+Math.max(0,fieldBottom-visibleBottom);
}
