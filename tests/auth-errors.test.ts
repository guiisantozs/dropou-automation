import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authUnavailable} from '../src/lib/auth-errors';
test('rede bloqueada e indisponibilidade não significam sessão expirada',()=>{
 assert.equal(authUnavailable({name:'AuthRetryableFetchError',status:0}),true);
 assert.equal(authUnavailable({name:'AuthApiError',status:503}),true);
 assert.equal(authUnavailable({name:'AuthApiError',status:401}),false);
 assert.equal(authUnavailable({name:'AuthApiError',status:403}),false);
});
