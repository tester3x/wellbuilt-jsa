import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import {parsePlatformOwnerHint,decidePlatformAppEntry} from '../services/platformRuntime.generated';
import {loadUsableGovernedSession,currentGovernedAuthUid} from '../services/sso/jsaGovernedAuthLive';
import {inspectGovernedIdentityStartupDetailed} from '../services/sso/jsaIdentityStartupLive';
import {mintAttempt} from '../services/sso/jsaRuntime';
import {buildAuthorizeUrl} from '../services/sso/jsaPkce';
export default function PlatformJsaOpen(){
 const params=useLocalSearchParams();const [error,setError]=useState(false);
 useEffect(()=>{let active=true;
  void (async()=>{
   const hint=parsePlatformOwnerHint(params);if(!hint.ok)throw Error('invalid_entry');
   const inspection=await inspectGovernedIdentityStartupDetailed({preferCached:true});
   const session=await loadUsableGovernedSession();
   const action=decidePlatformAppEntry({restored:true,sdkUid:currentGovernedAuthUid(),requestedOwner:hint.owner,
    session:session?{owner:session,establishedAccess:inspection.state==='usable'}:null});
   if(!active)return;
   if(action==='resume'){router.replace('/(tabs)');return;}
   const attempt=await mintAttempt({purpose:'app_access',randomBytes:n=>Crypto.getRandomBytesAsync(n),
     sha256Hex:s=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,s),nowMs:()=>Date.now()});
   if(active)await Linking.openURL(buildAuthorizeUrl(attempt));
  })().catch(()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[params.driverId,params.companyId]);
 return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>{error?<Text>Could not establish JSA access. Your saved work is preserved. Return to Suite and retry.</Text>:<ActivityIndicator/>}</View>;
}
