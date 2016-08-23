'use strict';

const _ = require('lodash');

const STATUS = {
    PENDING: 0,
    RESOLVED: 1,
    REJECTED: 2
};

const _status = Symbol('status');
const _result = Symbol('result');
const _callbacks = Symbol('callbacks');

class Promise {
    constructor(exec) {
        let self = this;

        if (!_.isFunction(exec)) {
            throw new TypeError('Promise constructor argument exec must be a function.');
        }
        if (!(self instanceof Promise)) {
            return new Promise(exec);
        }

        self[_status] = STATUS.PENDING; 
        self[_result] = undefined;
        self[_callbacks] = [];

        function resolve(value) {
            if (value instanceof Promise) {
                return value.then(resolve, reject);
            }
            process.nextTick(() => {
                if (self[_status] === STATUS.PENDING) {
                    self[_status] = STATUS.RESOLVED;
                    self[_result] = value;
                    self[_callbacks].forEach(cb => cb.onResolved(self[_result]));
                }
            });
        }

        function reject(reason) {
            process.nextTick(() => {
                if (self[_status] === STATUS.PENDING) {
                    self[_status] = STATUS.REJECTED;
                    self[_result] = reason;
                    self[_callbacks].forEach(cb => cb.onRejected(self[_result]));
                }
            });
        }

        try {
            exec(resolve, reject);
        } catch(e) {
            reject(e);
        }
    }

    then(onResolved, onRejected) {
        onResolved = _.isFunction(onResolved) ? onResolved : v => v;
        onRejected = _.isFunction(onRejected) ? onRejected : r => { throw r };

        let childPromise, value, self = this;

        function solver(promise, result, resolve, reject) {
            let then, settled = false;

            if (promise === result) {
                return reject(new TypeError('Cycle Promises'));
            }

            if (result instanceof Promise) {
                if (result[_status] === STATUS.PENDING) {
                    result.then(v => solver(promise, v, resolve, reject), reject);
                } else {
                    result.then(resolve, reject);
                }
            } else if ((result !== null) && (_.isObject(result) || _.isFunction(result))) {
                try {
                    then = result.then;
                    if (_.isFunction(then)) {
                        then.call(result, s => {
                            if (settled) return;
                            settled = true;
                            return solver(promise, s, resolve, reject);
                        }, r => {
                            if (settled) return;
                            settled = true;
                            return reject(r);
                        });
                    } else {
                        return resolve(result);
                    }
                } catch (e) {
                    if (settled) return;
                    settled = true;
                    return reject(e);
                }
            } else {
                return resolve(result);
            }
        }

        function childExec(value, onDone, resolve, reject, childPromise) {
            try {
                value = onDone(value);
                solver(childPromise, value, resolve, reject);
            } catch(e) {
                reject(e);
            }
        }

        switch (self[_status]) {
            case STATUS.RESOLVED:
                childPromise = new Promise((resolve, reject) => {
                    process.nextTick(() => childExec(self[_result], onResolved, resolve, reject, childPromise));
                });
                break;
            case STATUS.REJECTED:
                childPromise = new Promise((resolve, reject) => {
                    process.nextTick(() => childExec(self[_result], onRejected, resolve, reject, childPromise));
                });
                break;
            case STATUS.PENDING:
                childPromise = new Promise((resolve, reject) => {
                    try {
                        self[_callbacks].push({
                            onResolved: (value) => childExec(value, onResolved, resolve, reject, childPromise),
                            onRejected: (value) => childExec(value, onRejected, resolve, reject, childPromise)
                        });
                    } catch (e) {
                        reject(e);
                    }
                });
                break;
            default: 
                throw new TypeError('Invalid status value');
        }

        return childPromise;
    }

    catch(onRejected) {
        return this.then(undefined, onRejected);
    }

    static resolve(value) {
        return new Promise((resolve, reject) => resolve(value));
    }

    static reject(value) {
        return new Promise((resolve, reject) => reject(value));
    }

    static deferred() {
        let dfd = {};
        dfd.promise = new Promise((resolve, reject) => {
            dfd.resolve = resolve;
            dfd.reject = reject;
        });
        return dfd;
    }
};

// test
console.log('A easy self test:\n');
Promise.reject({ dummy: "dummy" }).then(undefined, () => {
    return console.log('done()');
}).then(() => {
    return console.log('End of self test');
});

module.exports = Promise;