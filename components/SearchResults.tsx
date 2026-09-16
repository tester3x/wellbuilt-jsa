import React from 'react';
import {ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {useTheme} from '../app/contexts/ThemeContext';
/** Same inline, bounded list pattern as WB-T AutocompleteInput. */
export default function SearchResults({children}:{children:React.ReactNode}){
 const {accent}=useTheme();
 return <View style={[styles.list,{borderColor:accent}]}><ScrollView style={{maxHeight:200}} nestedScrollEnabled keyboardShouldPersistTaps="handled" keyboardDismissMode="none">{children}</ScrollView></View>;
}
export function SearchResult({label,detail,onPress}:{label:string;detail?:string;onPress:()=>void}){
 return <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}><Text style={styles.label}>{label}</Text>{!!detail&&<Text style={styles.detail}>{detail}</Text>}</TouchableOpacity>;
}
const styles=StyleSheet.create({list:{backgroundColor:'#fff',borderWidth:1,borderRadius:6,marginBottom:4,maxHeight:200,overflow:'hidden'},row:{paddingVertical:10,paddingHorizontal:12,borderBottomWidth:1,borderBottomColor:'#ddd'},label:{fontSize:16,color:'#222'},detail:{fontSize:12,color:'#666',marginTop:2}});
