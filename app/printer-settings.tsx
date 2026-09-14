import React from 'react';
import {ScrollView} from 'react-native';
import {Stack} from 'expo-router';
import PrinterSettings from '../components/PrinterSettings';
export default function PrinterSettingsScreen(){return <><Stack.Screen options={{title:'Printer settings'}}/><ScrollView contentContainerStyle={{padding:20}}><PrinterSettings/></ScrollView></>;}
