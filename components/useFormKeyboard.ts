import {useCallback,useEffect,useRef,useState} from 'react';
import {Keyboard,ScrollView,TextInput,type KeyboardEvent} from 'react-native';
import {keyboardRevealOffset} from '../utils/keyboardRevealOffset';
/** Reveal the focused input AND its inline results, including overlay keyboards. */
export function useFormKeyboard(){
 const scrollRef=useRef<ScrollView>(null),offset=useRef(0),top=useRef<number|null>(null);
 const active=useRef<{input:TextInput|null;results:number}>({input:null,results:0});
 const [height,setHeight]=useState(0),frame=useRef<number|null>(null);
 const reveal=useCallback(()=>{
  if(frame.current!==null)cancelAnimationFrame(frame.current);
  frame.current=requestAnimationFrame(()=>{frame.current=null;
   const {input,results}=active.current;if(!input?.isFocused()||top.current===null)return;
   scrollRef.current?.getNativeScrollRef()?.measureInWindow((_x:number,y:number,_w:number,h:number)=>input.measureInWindow((_ix,iy,_iw,ih)=>{
    if(!input.isFocused()||top.current===null)return;
    const reserve=Math.min(results,Math.max(0,Math.min(y+h,top.current)-y-ih-48));
    const next=keyboardRevealOffset(offset.current,iy+ih+reserve,y+h,top.current);
    if(next>offset.current+1)scrollRef.current?.scrollTo({y:next,animated:true});
   }));
  });
 },[]);
 useEffect(()=>{const update=(e:KeyboardEvent)=>{top.current=e.endCoordinates.screenY;setHeight(e.endCoordinates.height);reveal();};
  const subs=[Keyboard.addListener('keyboardDidShow',update),Keyboard.addListener('keyboardDidChangeFrame',update),Keyboard.addListener('keyboardDidHide',()=>{top.current=null;setHeight(0);})];
  return()=>{subs.forEach(s=>s.remove());if(frame.current!==null)cancelAnimationFrame(frame.current);};
 },[reveal]);
 return {scrollRef,height,reveal,focus:(input:TextInput|null,results=0)=>{active.current={input,results};reveal();},
  scrollProps:{onScroll:(e:any)=>{offset.current=e.nativeEvent.contentOffset.y;},scrollEventThrottle:16,onLayout:reveal,onContentSizeChange:reveal,keyboardDismissMode:'none' as const,keyboardShouldPersistTaps:'handled' as const}};
}
