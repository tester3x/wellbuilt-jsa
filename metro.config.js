// Expo's native export path discovers this file even when --config is ignored.
// Production remains the standard Expo configuration; isolation is opt-in and
// installed only under the audit package IDs enforced by the audit runtime.
module.exports=process.env.WB_GUIDED_AUDIT==='1'
 ? require('./tools/guided-audit/metro.config.cjs')
 : require('expo/metro-config').getDefaultConfig(__dirname);
