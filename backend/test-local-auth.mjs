import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLocalProfile } from './src/localAuth.js';
const good = { schema:1,status:'completed',updatedAt:'2026-11-23T10:00:00Z',setting:'home',countryCode:'PK',frameworkId:'intl-core',stage:'A4',languages:['en','ur'],modules:[] };
test('accepts a well formed AICS profile', () => assert.equal(validateLocalProfile(good).valid,true));
test('rejects extra private fields', () => assert.equal(validateLocalProfile({...good,childName:'private'}).valid,false));
test('rejects duplicate languages', () => assert.equal(validateLocalProfile({...good,languages:['en','en']}).valid,false));
test('rejects missing profile', () => assert.equal(validateLocalProfile(null).valid,false));
