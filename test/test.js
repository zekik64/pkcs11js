const assert = require("assert");
const os = require("os");
const pkcs11 = require("../index");

// const libPath = "C:\\Windows\\System32\\jcPKCS11.dll";
// const libPath = "C:\\tmp\\rtpkcs11ecp.dll";
// const libPath = "/usr/local/lib/softhsm/libsofthsm2.so";
const libPath = "/usr/safenet/lunaclient/lib/libCryptoki2_64.so";
//const libPath = "/usr/safenet/lunaclient/lib/libcklog2.so";
//const libPath = "/usr/local/lib/softhsm/libsofthsm2.so"; // travis-ci test

const timeout = 10000; // 10s

const tokenPin = "userpin"; // travis-ci test
const slot_index = 0;

const mod_assert = "Module is not initialized";
const slot_assert = "Slot is not found";
const session_assert = "Session is not opened";
const private_assert = "Private key is not created";
const public_assert = "Private key is not created";
const secret_aes_assert = "Secret key is not created";

const ignoreErrors = [
    "CKR_FUNCTION_NOT_SUPPORTED",
    "CKR_RANDOM_SEED_NOT_SUPPORTED",
    "CKR_MECHANISM_INVALID",
    "CKR_TEMPLATE_INCONSISTENT",
    "CKR_MECHANISM_INVALID"
]

function getPkcs11Error(error) {
    var regEx = /^(CKR_\w+):(\d)+/i;
    var res = regEx.exec(error ? error.message : "")
    if (res) {
        return {
            name: res[1],
            value: res[2]
        };
    }
    return null;
}

function warn(msg) {
    console.warn(`    \x1b[33mWARN:\x1b[0m ${msg}`);
}

function runPkcs11Function(cb, ignoreErrors) {
    ignoreErrors = ignoreErrors || [];
    try {
        cb();
    }
    catch (e) {
        var p11e = getPkcs11Error(e);

        if (!p11e || ignoreErrors.indexOf(p11e.name) === -1)
            throw e;
        warn(`Ignore error ${p11e.name}`);
        return false
    }
    return true
}

function checkParam(param, value, warnMsg) {
    if (param !== value) {
        warn(warnMsg);
        return false;
    }
    return true;
}

describe("PKCS11", () => {

    var _mod, _slot, _session, _privateKey, _publicKey, _secretKey,
        _privateKeyEC, _publicKeyEC;

    after(() => {
        if (_session !== void 0) {
            _mod.C_Logout(_session);
            _mod.C_CloseSession(_session);
        }
        if (_mod)
            _mod.C_Finalize();
            _mod.close();
    });

    context("Module", () => {

        it("load from wrong pkcs11 library", () => {
            var mod = new pkcs11.PKCS11();
            assert.throws(() => {
                mod.load("some/wrong/lib");
            }, "Must be error on usin wrong lib");
        });

        it("check correct lib", () => {
            var mod = new pkcs11.PKCS11();
            mod.load(libPath);
            assert.equal(!!mod, true);
            _mod = mod;
        });

        it("get Info", () => {
            assert.equal(!!_mod, true, mod_assert);

            _mod.C_Initialize();

            var info = _mod.C_GetInfo();

            assert.equal(!!info.cryptokiVersion, true);
            assert.equal(!!info.manufacturerID, true);
            assert.equal(info.flags, 0);
            assert.equal(!!info.libraryDescription, true);
            assert.equal(!!info.libraryVersion, true);
        });

    });

    context("Slot", () => {

        it("get list", () => {
            assert.equal(!!_mod, true, mod_assert);

            var slots = _mod.C_GetSlotList(true);
            assert.equal(!!slots.length, true, "Slots are not found");
            _slot = slots[slot_index];
            assert.equal(Buffer.isBuffer(_slot), true, "Handle is not Buffer");
        });

        it("get info", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_slot, undefined, slot_assert);

            var info = _mod.C_GetSlotInfo(_slot);

            assert.equal(!!info.slotDescription, true);
            assert.equal(!!info.manufacturerID, true);
            assert.equal(!!info.flags, true);
            assert.equal(!!info.hardwareVersion, true);
            assert.equal(!!info.firmwareVersion, true);
        });

        it("get Token Info", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_slot, undefined, slot_assert);

            var info = _mod.C_GetTokenInfo(_slot);

            assert.equal(!!info.label, true);
            assert.equal(!!info.manufacturerID, true);
            assert.equal(!!info.model, true);
            assert.equal(!!info.serialNumber, true);
            assert.equal("flags" in info, true);
            assert.equal("maxSessionCount" in info, true);
            assert.equal("sessionCount" in info, true);
            assert.equal("maxRwSessionCount" in info, true);
            assert.equal("rwSessionCount" in info, true);
            assert.equal("maxPinLen" in info, true);
            assert.equal("hardwareVersion" in info, true);
            assert.equal("firmwareVersion" in info, true);
            assert.equal("utcTime" in info, true);
        });

        it("get Mechanism Info", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_slot, undefined, slot_assert);

            var list = _mod.C_GetMechanismList(_slot);

            assert.equal(!!list.length, true);

            var info = _mod.C_GetMechanismInfo(_slot, list[0]);

            assert.equal("minKeySize" in info, true);
            assert.equal("maxKeySize" in info, true);
            assert.equal("flags" in info, true);
        });

    });

    context("Session", () => {

        it("open", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_slot, undefined, slot_assert);

            _session = _mod.C_OpenSession(_slot, 2 | 4);

            assert.notEqual(_session, undefined, session_assert);
            assert.equal(Buffer.isBuffer(_session), true, "Handle is not Buffer");
        });

        function changePIN(session, userType, oldPIN, newPIN) {
            _mod.C_Login(session, userType, oldPIN);
            _mod.C_SetPIN(session, oldPIN, newPIN);
            _mod.C_Logout(session);
        }

        it("change user PIN", () => {
            var session = _mod.C_OpenSession(_slot, 2 | 4);

            try {
                var newPIN = "54321";

                changePIN(session, 1, tokenPin, newPIN);
                changePIN(session, 1, newPIN, tokenPin);
            }
            catch (e) {
                _mod.C_CloseSession(session);
                throw e;
            }

            _mod.C_CloseSession(session);
        });

        it("change SO PIN", () => {
            var session = _mod.C_OpenSession(_slot, 2 | 4);

            try {
                var newPIN = "54321";

                changePIN(session, 0, tokenPin, newPIN);
                changePIN(session, 0, newPIN, tokenPin);
            }
            catch (e) {
                _mod.C_CloseSession(session);
                throw e;
            }

            _mod.C_CloseSession(session);
        });

        it("get Info", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_session, undefined, session_assert);

            var info = _mod.C_GetSessionInfo(_session);

            assert.equal("slotID" in info, true);
            assert.equal(Buffer.isBuffer(info.slotID), true, "Handle is not Buffer");
            assert.equal("state" in info, true);
            assert.equal("flags" in info, true);
            assert.equal("deviceError" in info, true);
        });

        it("login", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_session, undefined, session_assert);
            _mod.C_Login(_session, 1, tokenPin);
        });

        it("seed random", () => {
            var inBuf = new Buffer(20);
            var outBuf;
            if (runPkcs11Function(() => {
                outBuf = _mod.C_SeedRandom(_session, inBuf);
            }, ignoreErrors)) {
                assert.equal(inBuf, outBuf, "Out buffer is a point to incoming");
                assert.equal(inBuf.length, 20);
            }
        });

        it("generate random", () => {
            var inBuf = new Buffer(20);
            var outBuf;
            if (runPkcs11Function(() => {
                outBuf = _mod.C_GenerateRandom(_session, inBuf);
            }, ignoreErrors)) {
                assert.equal(inBuf, outBuf, "Out buffer is a point to incoming");
                assert.equal(inBuf.length, 20);
            }
        });

        it("generate key", () => {
            var template = [
                { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_SECRET_KEY },
                { type: pkcs11.CKA_TOKEN, value: false },
                { type: pkcs11.CKA_LABEL, value: "My AES Key" },
                { type: pkcs11.CKA_VALUE_LEN, value: 256 / 8 },
                { type: pkcs11.CKA_ENCRYPT, value: true },
                { type: pkcs11.CKA_DECRYPT, value: true },
            ];
            var key;
            if (runPkcs11Function(() => {
                key = _mod.C_GenerateKey(_session, { mechanism: pkcs11.CKM_AES_KEY_GEN }, template);
            }, ignoreErrors)) {
                assert.equal(!!key, true);
                _secretKey = key;
                assert.equal(Buffer.isBuffer(_secretKey), true, "Handle is not Buffer");
            }
        }).timeout(timeout);

        it("generate key async", (done) => {
            var template = [
                { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_SECRET_KEY },
                { type: pkcs11.CKA_TOKEN, value: false },
                { type: pkcs11.CKA_LABEL, value: "My AES Key" },
                { type: pkcs11.CKA_VALUE_LEN, value: 256 / 8 },
                { type: pkcs11.CKA_ENCRYPT, value: true },
                { type: pkcs11.CKA_DECRYPT, value: true },
            ];
            _mod.C_GenerateKey(_session, { mechanism: pkcs11.CKM_AES_KEY_GEN }, template, (err, key) => {
                if (err) {
                    var p11e = getPkcs11Error(err);
                    if (!p11e || ignoreErrors.indexOf(p11e.name) === -1)
                        throw err;
                    warn(`Ignore error ${p11e.name}`);
                }
                else {
                    assert(!!key, true);
                    assert.equal(Buffer.isBuffer(key), true, "Handle is not Buffer");
                }
                done();
            });
        }).timeout(timeout);

        it("generate key pair RSA", () => {
            var publicKeyTemplate = [
                { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PUBLIC_KEY },
                { type: pkcs11.CKA_TOKEN, value: false },
                { type: pkcs11.CKA_LABEL, value: "My RSA Public Key" },
                { type: pkcs11.CKA_PUBLIC_EXPONENT, value: new Buffer([1, 0, 1]) },
                { type: pkcs11.CKA_MODULUS_BITS, value: 1024 },
                { type: pkcs11.CKA_VERIFY, value: true }
            ];
            var privateKeyTemplate = [
                { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
                { type: pkcs11.CKA_TOKEN, value: false },
                { type: pkcs11.CKA_LABEL, value: "My RSA Private Key" },
                { type: pkcs11.CKA_SIGN, value: true },
            ];
            var keys;
            if (runPkcs11Function(() => {
                keys = _mod.C_GenerateKeyPair(_session, { mechanism: pkcs11.CKM_RSA_PKCS_KEY_PAIR_GEN }, publicKeyTemplate, privateKeyTemplate);
            }, ignoreErrors)) {
                assert.equal(!!keys, true);
                assert.equal("privateKey" in keys, true);
                assert.equal(!!keys.privateKey, true);
                assert.equal("publicKey" in keys, true);
                assert.equal(!!keys.publicKey, true);
                _privateKey = keys.privateKey;
                _publicKey = keys.publicKey;
                assert.equal(Buffer.isBuffer(keys.privateKey), true, "Handle is not Buffer");
                assert.equal(Buffer.isBuffer(keys.publicKey), true, "Handle is not Buffer");
            }
        }).timeout(timeout);

        it("generate key pair RSA async", (done) => {
            var publicKeyTemplate = [
                { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PUBLIC_KEY },
                { type: pkcs11.CKA_TOKEN, value: false },
                { type: pkcs11.CKA_LABEL, value: "My RSA Public Key" },
                { type: pkcs11.CKA_PUBLIC_EXPONENT, value: new Buffer([1, 0, 1]) },
                { type: pkcs11.CKA_MODULUS_BITS, value: 1024 },
                { type: pkcs11.CKA_VERIFY, value: true }
            ];
            var privateKeyTemplate = [
                { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
                { type: pkcs11.CKA_TOKEN, value: false },
                { type: pkcs11.CKA_LABEL, value: "My RSA Private Key" },
                { type: pkcs11.CKA_SIGN, value: true },
            ];
            _mod.C_GenerateKeyPair(_session, { mechanism: pkcs11.CKM_RSA_PKCS_KEY_PAIR_GEN }, publicKeyTemplate, privateKeyTemplate, (err, keys) => {
                if (err) {
                    var p11e = getPkcs11Error(err);
                    if (!p11e || ignoreErrors.indexOf(p11e.name) === -1)
                        throw err;
                    warn(`Ignore error ${p11e.name}`);
                }
                else {
                    assert.equal(!!keys, true);
                    assert.equal("privateKey" in keys, true);
                    assert.equal(!!keys.privateKey, true);
                    assert.equal("publicKey" in keys, true);
                    assert.equal(!!keys.publicKey, true);
                    assert.equal(Buffer.isBuffer(keys.privateKey), true, "Handle is not Buffer");
                    assert.equal(Buffer.isBuffer(keys.publicKey), true, "Handle is not Buffer");
                }
                done();
            });
        }).timeout(timeout);

        it("generate key pair EC", () => {
            var publicKeyTemplate = [
                { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PUBLIC_KEY },
                { type: pkcs11.CKA_TOKEN, value: false },
                { type: pkcs11.CKA_LABEL, value: "My EC Public Key" },
                { type: pkcs11.CKA_EC_PARAMS, value: new Buffer("06082A8648CE3D030107", "hex") },
            ];
            var privateKeyTemplate = [
                { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
                { type: pkcs11.CKA_TOKEN, value: false },
                { type: pkcs11.CKA_LABEL, value: "My EC Private Key" },
                { type: pkcs11.CKA_DERIVE, value: true },
            ];
            var keys;
            if (runPkcs11Function(() => {
                keys = _mod.C_GenerateKeyPair(_session, { mechanism: pkcs11.CKM_EC_KEY_PAIR_GEN }, publicKeyTemplate, privateKeyTemplate);
            }, ignoreErrors)) {
                assert.equal(!!keys, true);
                assert.equal("privateKey" in keys, true);
                assert.equal(!!keys.privateKey, true);
                assert.equal("publicKey" in keys, true);
                assert.equal(!!keys.publicKey, true);
                _privateKeyEC = keys.privateKey;
                _publicKeyEC = keys.publicKey;
            }
        }).timeout(timeout);

        context("Object", () => {

            var _nObject;
            var _nObjetcLabel = "My custom Object";

            var object_assert = "Object is not found";

            it("create", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);
                _nObject = _mod.C_CreateObject(_session, [
                    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_DATA },
                    { type: pkcs11.CKA_TOKEN, value: false },
                    { type: pkcs11.CKA_PRIVATE, value: false },
                    { type: pkcs11.CKA_LABEL, value: _nObjetcLabel },
                ]);

                assert.equal(!!_nObject, true);
                assert.equal(Buffer.isBuffer(_nObject), true, "Handle is not Buffer");
            });

            it("copy", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);

                var cObject;
                if (runPkcs11Function(() => {
                    cObject = _mod.C_CopyObject(_session, _nObject, [
                        { type: pkcs11.CKA_TOKEN, value: false },
                    ]);
                }, ignoreErrors)) {
                    assert.equal(!!cObject, true);
                    assert.equal(Buffer.isBuffer(cObject), true, "Handle is not Buffer");
                }
            });

            it("get Attribute", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);
                assert.notEqual(_nObject, undefined, object_assert);

                var label = _mod.C_GetAttributeValue(_session, _nObject, [{ type: pkcs11.CKA_LABEL }]);

                assert.equal(label[0].value.toString(), _nObjetcLabel);
            });

            it("get Attribute list", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);
                assert.notEqual(_nObject, undefined, object_assert);

                var label = _mod.C_GetAttributeValue(_session, _nObject, [
                    { type: pkcs11.CKA_LABEL },
                    { type: pkcs11.CKA_CLASS },
                    { type: pkcs11.CKA_TOKEN }
                ]);

                assert.equal(label.length, 3);
            });

            it("set Attribute", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);
                assert.notEqual(_nObject, undefined, object_assert);

                _mod.C_SetAttributeValue(_session, _nObject, [{ type: pkcs11.CKA_LABEL, value: _nObjetcLabel + "!!!" }]);
                var label = _mod.C_GetAttributeValue(_session, _nObject, [{ type: pkcs11.CKA_LABEL }]);

                assert.equal(label[0].value.toString(), _nObjetcLabel + "!!!");
            });

            it("find without search params", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);

                _mod.C_FindObjectsInit(_session);
                var hObject = _mod.C_FindObjects(_session);
                _mod.C_FindObjectsFinal(_session);
                assert.equal(!!hObject, true);
                assert.equal(Buffer.isBuffer(hObject), true, "Handle is not Buffer");
            })

            it("find with search params", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);

                _mod.C_FindObjectsInit(_session, [{ type: pkcs11.CKA_CLASS, value: pkcs11.CKO_DATA }]);
                var hObject = _mod.C_FindObjects(_session);
                _mod.C_FindObjectsFinal(_session);
                assert.equal(!!hObject, true);
                var obj_class = _mod.C_GetAttributeValue(_session, _nObject, [{ type: pkcs11.CKA_CLASS }]);
                assert.equal(obj_class[0].value.readUInt32LE(), pkcs11.CKO_DATA);
            });

            it("get size", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);
                if (!checkParam(!!_nObject, true, object_assert)) return;

                var oSize;
                if (runPkcs11Function(() => {
                    oSize = _mod.C_GetObjectSize(_session, _nObject);
                }, ignoreErrors)) {
                    assert.equal(!!oSize, true);
                }
            });

            it("destroy", () => {
                assert.equal(!!_mod, true, mod_assert);
                assert.notEqual(_session, undefined, session_assert);
                if (!checkParam(!!_nObject, true, object_assert)) return;

                _mod.C_DestroyObject(_session, _nObject);
            });
        });
    });

    context("Crypto", () => {

        it("digest", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_session, undefined, session_assert);

            const digest_size = 32;
            var digest;
            if (runPkcs11Function(() => {
                _mod.C_DigestInit(_session, { mechanism: pkcs11.CKM_SHA256 });
                _mod.C_DigestUpdate(_session, new Buffer("Hello my test"));
                _mod.C_DigestUpdate(_session, new Buffer("!!!"));
                digest = _mod.C_DigestFinal(_session, Buffer(digest_size + 10));
            }, ignoreErrors)) {
                assert.equal(digest.length, digest_size);
                assert.equal(digest.toString("hex"), "557685952545061c49b04f4c0658496f56da5d8858f6dad5540eb10885dc7736");
            }

        });

        it("encrypt/decrypt", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_session, undefined, session_assert);
            if (!checkParam(!!_secretKey, true, secret_aes_assert)) return;
            if (!checkParam(!!_privateKey, true, private_assert)) return;
            if (!checkParam(!!_publicKey, true, public_assert)) return;

            var crypto_param = new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

            _mod.C_EncryptInit(
                _session,
                {
                    mechanism: pkcs11.CKM_AES_CBC,
                    parameter: crypto_param
                },
                _secretKey
            );
            var enc = new Buffer(0);
            enc = Buffer.concat([enc, _mod.C_EncryptUpdate(_session, new Buffer("1234567812345678"), new Buffer(200))]);
            enc = Buffer.concat([enc, _mod.C_EncryptUpdate(_session, new Buffer("1234567812345678"), new Buffer(200))]);
            const enc_size = 32;
            enc = Buffer.concat([enc, _mod.C_EncryptFinal(_session, new Buffer(16))]);
            assert.equal(enc_size, enc.length);

            // Correct decrypt
            _mod.C_DecryptInit(
                _session,
                {
                    mechanism: pkcs11.CKM_AES_CBC,
                    parameter: crypto_param
                },
                _secretKey
            );
            var dec = new Buffer(0);
            dec = Buffer.concat([dec, _mod.C_DecryptUpdate(_session, enc, new Buffer(200))]);
            dec = Buffer.concat([dec, _mod.C_DecryptFinal(_session, new Buffer(16))]);
            assert.equal(32, dec.length);
            assert.equal(dec.toString(), "12345678123456781234567812345678");


            // Not correct signature
            _mod.C_DecryptInit(
                _session,
                {
                    mechanism: pkcs11.CKM_AES_CBC,
                    parameter: crypto_param
                },
                _secretKey
            );
            var dec = new Buffer(0);
            dec = Buffer.concat([dec, _mod.C_DecryptUpdate(_session, new Buffer("Wrong data______Wrong data______"), new Buffer(200))]);
            dec = Buffer.concat([dec, _mod.C_DecryptFinal(_session, new Buffer(16))]);
            assert.notEqual(dec.toString(), "12345678123456781234567812345678");
        });

        it("sign/verify", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_session, undefined, session_assert);
            if (!checkParam(!!_privateKey, true, private_assert)) return;
            if (!checkParam(!!_privateKey, true, private_assert)) return;

            _mod.C_SignInit(_session, { mechanism: pkcs11.CKM_SHA256_RSA_PKCS }, _privateKey);
            _mod.C_SignUpdate(_session, new Buffer("Hello my test"));
            _mod.C_SignUpdate(_session, new Buffer("!!!"));
            const signature_size = 256;
            var signature = _mod.C_SignFinal(_session, Buffer(signature_size + 10));

            // Correct signature
            _mod.C_VerifyInit(_session, { mechanism: pkcs11.CKM_SHA256_RSA_PKCS }, _publicKey);
            _mod.C_VerifyUpdate(_session, new Buffer("Hello my test"));
            _mod.C_VerifyUpdate(_session, new Buffer("!!!"));
            var verify = _mod.C_VerifyFinal(_session, signature);
            assert.equal(verify, true);

            // Not correct signature
            _mod.C_VerifyInit(_session, { mechanism: pkcs11.CKM_SHA256_RSA_PKCS }, _publicKey);
            _mod.C_VerifyUpdate(_session, new Buffer("Hello my test"));
            _mod.C_VerifyUpdate(_session, new Buffer("!!!<Error here"));
            assert.throws(() => { _mod.C_VerifyFinal(_session, signature); }, "Signed content is not right, MUST be CKR_SIGNATURE_INVALID error here");
        });

        it("derive key", () => {
            assert.equal(!!_mod, true, mod_assert);
            assert.notEqual(_session, undefined, session_assert);
            if (!checkParam(!!_privateKeyEC, true, private_assert)) return;
            if (!checkParam(!!_publicKeyEC, true, private_assert)) return;

            var attrs = _mod.C_GetAttributeValue(_session, _publicKeyEC, [{ type: pkcs11.CKA_EC_POINT }])
            var ec = attrs[0].value;

            var mech = {
                mechanism: pkcs11.CKM_ECDH1_DERIVE,
                parameter: {
                    type: pkcs11.CK_PARAMS_EC_DH,
                    kdf: pkcs11.CKD_NULL,
                    publicData: ec
                }
            };

            var derivedKey = _mod.C_DeriveKey(
                _session,
                mech,
                _privateKeyEC,
                [
                    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_SECRET_KEY },
                    { type: pkcs11.CKA_TOKEN, value: false },
                    { type: pkcs11.CKA_KEY_TYPE, value: pkcs11.CKK_AES },
                    { type: pkcs11.CKA_LABEL, value: "Derived key" },
                    { type: pkcs11.CKA_ENCRYPT, value: true },
                    { type: pkcs11.CKA_VALUE_LEN, value: 256 / 8 }
                ]
            );
            assert.equal(!!derivedKey, true, "Key was not derived");
            assert.equal(Buffer.isBuffer(derivedKey), true, "Handle is not Buffer");
        });

    });

    context("NSS", () => {

        const libPathNSS = os.platform() === "darwin" ?  "/usr/local/opt/nss/lib/libsoftokn3.dylib" : "/usr/lib/x86_64-linux-gnu/nss/libsoftokn3.so";

        it("open", () => {
            const mod = new pkcs11.PKCS11();
            mod.load(libPathNSS);

            mod.C_Initialize({
                libraryParameters: "configdir='' certPrefix='' keyPrefix='' secmod='' flags=readOnly,noCertDB,noModDB,forceOpen,optimizeSpace",
            });

            const slots = mod.C_GetSlotList(true);
            const slot = slots[1];
            const session = mod.C_OpenSession(slot, pkcs11.CKF_SERIAL_SESSION);
            const rnd = mod.C_GenerateRandom(session, new Buffer(20));
            assert.equal(!!rnd, true);
            assert.equal(rnd.length, 20);

            mod.C_Finalize();
        });
    });

    context("BIP32", () => {

        function generateSeed() {
            var seedTemplate = [
                {type: pkcs11.CKA_KEY_TYPE, value: pkcs11.CKK_GENERIC_SECRET},
                {type: pkcs11.CKA_TOKEN, value: false},
                {type: pkcs11.CKA_DERIVE, value: true},
                {type: pkcs11.CKA_PRIVATE, value: true},
                {type: pkcs11.CKA_EXTRACTABLE, value: false},
                {type: pkcs11.CKA_MODIFIABLE, value: false},
                {type: pkcs11.CKA_VALUE_LEN, value: 32}
            ];

            return _mod.C_GenerateKey(_session, { mechanism: pkcs11.CKM_GENERIC_SECRET_KEY_GEN }, seedTemplate);
        }

        function injectSeed(seed) {
            var aesTemplate = [
                {type: pkcs11.CKA_TOKEN, value: false},
                {type: pkcs11.CKA_ENCRYPT, value: true},
                {type: pkcs11.CKA_UNWRAP, value: true},
                {type: pkcs11.CKA_PRIVATE, value: true},
                {type: pkcs11.CKA_VALUE_LEN, value: 32}
            ];

            var aes = _mod.C_GenerateKey(_session, { mechanism: pkcs11.CKM_AES_KEY_GEN }, aesTemplate);

            var mech = {
                mechanism: pkcs11.CKM_AES_CBC,
                parameter: new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
            };

            _mod.C_EncryptInit(_session, mech, aes);
            var encrypted = _mod.C_Encrypt(_session, seed, new Buffer(200));

            var unwrapTemplate = [
                {type: pkcs11.CKA_CLASS, value: pkcs11.CKO_SECRET_KEY},
                {type: pkcs11.CKA_KEY_TYPE, value: pkcs11.CKK_GENERIC_SECRET},
                {type: pkcs11.CKA_TOKEN, value: false},
                {type: pkcs11.CKA_DERIVE, value: true},
                {type: pkcs11.CKA_EXTRACTABLE, value: false},
                {type: pkcs11.CKA_MODIFIABLE, value: false},
                {type: pkcs11.CKA_PRIVATE, value: true},
                {type: pkcs11.CKA_VALUE_LEN, value: seed.length}
            ];

            return _mod.C_UnwrapKey(_session, mech, aes, encrypted, unwrapTemplate);
        }

        function deriveMaster(seed, callback) {
            var publicKeyTemplate = [
                                { type: pkcs11.CKA_TOKEN, value: false },
                                { type: pkcs11.CKA_PRIVATE, value: true },
                                { type: pkcs11.CKA_VERIFY, value: true },
                                { type: pkcs11.CKA_DERIVE, value: true },
                                { type: pkcs11.CKA_MODIFIABLE, value: false },
            ];
            var privateKeyTemplate = [
                                { type: pkcs11.CKA_TOKEN, value: false },
                                { type: pkcs11.CKA_PRIVATE, value: true },
                                { type: pkcs11.CKA_SIGN, value: true },
                                { type: pkcs11.CKA_DERIVE, value: true },
                                { type: pkcs11.CKA_MODIFIABLE, value: false },
                                { type: pkcs11.CKA_EXTRACTABLE, value: false },
            ];

            if (callback) {
                _mod.DeriveBIP32Master(_session, seed, publicKeyTemplate, privateKeyTemplate, callback);
            } else {
                return _mod.DeriveBIP32Master(_session, seed, publicKeyTemplate, privateKeyTemplate);
            }
        }

        function deriveChild(masterPrivate, path, callback) {
            var publicKeyTemplate = [
                                { type: pkcs11.CKA_TOKEN, value: false },
                                { type: pkcs11.CKA_PRIVATE, value: true },
                                { type: pkcs11.CKA_VERIFY, value: true },
                                { type: pkcs11.CKA_DERIVE, value: false },
                                { type: pkcs11.CKA_MODIFIABLE, value: false },
            ];
            var privateKeyTemplate = [
                                { type: pkcs11.CKA_TOKEN, value: false },
                                { type: pkcs11.CKA_PRIVATE, value: true },
                                { type: pkcs11.CKA_SIGN, value: true },
                                { type: pkcs11.CKA_DERIVE, value: false },
                                { type: pkcs11.CKA_MODIFIABLE, value: false },
                                { type: pkcs11.CKA_EXTRACTABLE, value: false },
            ];
            if (callback) {
                _mod.DeriveBIP32Child(_session, masterPrivate, publicKeyTemplate, privateKeyTemplate, path, callback);
            } else {
                return _mod.DeriveBIP32Child(_session, masterPrivate, publicKeyTemplate, privateKeyTemplate, path);
            }
        }

        function signVerify(keyPair) {
            var hash = new Buffer("02bea3145fecbcd0eb1c8a86b5b5c7d71765db84d98e31f9939c2671a6f01603", "hex");
            var mech = {
                mechanism: pkcs11.CKM_ECDSA,
            };
            _mod.C_SignInit(_session, mech, keyPair['privateKey'])
            var sig = _mod.C_Sign(_session, hash, Buffer.alloc(64));
            _mod.C_VerifyInit(_session, mech, keyPair['publicKey'])
            _mod.C_Verify(_session, hash, sig)
        }

        function parsePath(path) {
            var pathArray = [];
            var split = path.split("/");
            for (var i = 1; i < split.length; i++) {
                var index = split[i];
                var num = 0;
                if (split[i].endsWith("'")) {
                    num = 0x80000000;
                    index = index.replace("'", "");
                }
                num += parseInt(index, 10);
                pathArray.push(num);
            }
            return pathArray;
        }

        function getECPoint(publicKey) {
            return _mod.C_GetAttributeValue(_session, publicKey, [{ type: pkcs11.CKA_EC_POINT }])[0]["value"];
        }

        it("derive/sign/verify", () => {


            var seed = generateSeed();
            var master = deriveMaster(seed);
            var child = deriveChild(master['privateKey'], [0x80000000 + 44, 0x80000000 + 60, 0x80000000 + 0, 0, 0]);
            signVerify(child);

            var vector = [
                ["000102030405060708090a0b0c0d0e0f", "m/0'", "035a784662a4a20a65bf6aab9ae98a6c068a81c52e4b032c0fb5400c706cfccc56"],
                ["000102030405060708090a0b0c0d0e0f", "m/0'/1", "03501e454bf00751f24b1b489aa925215d66af2234e3891c3b21a52bedb3cd711c"],
                ["000102030405060708090a0b0c0d0e0f", "m/0'/1/2'", "0357bfe1e341d01c69fe5654309956cbea516822fba8a601743a012a7896ee8dc2"],
                ["000102030405060708090a0b0c0d0e0f", "m/0'/1/2'/2", "02e8445082a72f29b75ca48748a914df60622a609cacfce8ed0e35804560741d29"],
                ["000102030405060708090a0b0c0d0e0f", "m/0'/1/2'/2/1000000000", "022a471424da5e657499d1ff51cb43c47481a03b1e77f951fe64cec9f5a48f7011"],
                ["fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542", "m/0", "02fc9e5af0ac8d9b3cecfe2a888e2117ba3d089d8585886c9c826b6b22a98d12ea"],
                ["fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542", "m/0/2147483647'", "03c01e7425647bdefa82b12d9bad5e3e6865bee0502694b94ca58b666abc0a5c3b"],
                ["fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542", "m/0/2147483647'/1", "03a7d1d856deb74c508e05031f9895dab54626251b3806e16b4bd12e781a7df5b9"],
                ["fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542", "m/0/2147483647'/1/2147483646'", "02d2b36900396c9282fa14628566582f206a5dd0bcc8d5e892611806cafb0301f0"],
                ["fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542", "m/0/2147483647'/1/2147483646'/2", "024d902e1a2fc7a8755ab5b694c575fce742c48d9ff192e63df5193e4c7afe1f9c"],
            ];

            for(var i = 0; i < vector.length; i++) {
                var seed = injectSeed(new Buffer(vector[i][0], "hex"));
                var master = deriveMaster(seed);
                var path = parsePath(vector[i][1]);
                var child = deriveChild(master["privateKey"], path);
                var ecPoint = getECPoint(child["publicKey"]);
                ecPoint = ecPoint.slice(3, 3+32);
                var expected = new Buffer(vector[i][2], "hex");
                expected = expected.slice(1, expected.length);
                assert.equal(true, expected.equals(ecPoint));
                signVerify(child);
            }

        }).timeout(timeout);

        it("derive async", (done) => {
            var seed = generateSeed();
            deriveMaster(seed, (err, master) => {
                if (err) {
                    throw err;
                } else {
                    deriveChild(master['privateKey'], [0x80000000 + 44, 0x80000000 + 60, 0x80000000 + 0, 0, 0], (err, child) => {
                        if (err) {
                            throw err;
                        } else {
                            signVerify(child);
                            done();
                        }
                    });
                }
            });
        }).timeout(timeout);
    });


});
