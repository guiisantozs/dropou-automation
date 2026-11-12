import 'server-only';
import {adminDb} from '../db';
import {telegramTarget,operationTelegramEnv} from '../telegram';
import {shopeeEngine} from './engine';
export function shopeeAutomation(){return shopeeEngine({db:adminDb(),env:process.env,target:owner=>telegramTarget(owner,'dropou',true),telegramEnv:owner=>operationTelegramEnv(owner,'dropou')});}
