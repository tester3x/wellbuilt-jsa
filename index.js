import { AppRegistry } from 'react-native';
import { refreshTicketTimeForms } from './services/ticketTimeForms';
AppRegistry.registerHeadlessTask('JsaWorkFormsRefresh',()=>async data=>{ await refreshTicketTimeForms(data); });
require('expo-router/entry');
