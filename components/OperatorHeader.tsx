import React,{useState} from 'react';
import {Text,View} from 'react-native';

export default function OperatorHeader({name}:{name:string}){
 const [width,setWidth]=useState(0),[natural,setNatural]=useState(0);
 const fit=width&&natural?20*width/natural:20;
 const wrap=fit<14;
 return <View style={{width:'100%',height:44,justifyContent:'center',overflow:'hidden'}} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
   <Text key={name} accessible={false} onTextLayout={e=>setNatural(e.nativeEvent.lines[0]?.width||0)} style={{position:'absolute',width:10000,opacity:0,fontSize:20,fontWeight:'600'}}>{name}</Text>
   <Text accessibilityLabel={name} numberOfLines={wrap?2:1} style={{color:'white',fontSize:wrap?14:Math.min(20,Math.max(14,fit)),lineHeight:wrap?18:24,fontWeight:'600'}}>{name}</Text>
 </View>;
}
