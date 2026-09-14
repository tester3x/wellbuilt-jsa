import React from 'react';
import {View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

/** Equal layout slots; only the compact buttons inside them receive taps. */
export default function BottomActionBar({children}:{children:React.ReactNode}) {
  const insets=useSafeAreaInsets();
  return <View style={{flexDirection:'row',backgroundColor:'white',borderTopWidth:1,borderColor:'#ddd',paddingTop:8,paddingBottom:Math.max(insets.bottom,16)}}>
    {React.Children.toArray(children).map((child,index)=><View key={index} pointerEvents="box-none" style={{flex:1,minWidth:0,alignItems:'center',justifyContent:'center'}}>{child}</View>)}
  </View>;
}
