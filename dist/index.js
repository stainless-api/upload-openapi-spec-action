/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 177:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.cloneMonorepo = exports.main = void 0;
const until_1 = __nccwpck_require__(81);
const os_1 = __nccwpck_require__(37);
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const cwd = process.cwd();
        const customer = cwd.substring(cwd.lastIndexOf('/') + 1).split('-')[0];
        if (customer === undefined) {
            throw new Error('Failed to get customer name');
        }
        yield cloneMonorepo();
    });
}
exports.main = main;
function cloneMonorepo() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Cloning monorepo');
        yield (0, until_1.runCmd)('git', ['clone', 'https://github.com/stainless-api/stainless'], {
            cwd: (0, os_1.homedir)(),
        });
        console.log('Finished cloning monorepo');
    });
}
exports.cloneMonorepo = cloneMonorepo;
if (require.main === require.cache[eval('__filename')]) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}


/***/ }),

/***/ 81:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.runCmd = void 0;
const child_process_1 = __nccwpck_require__(493);
function runCmd(cmd, args, options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            var _a, _b;
            const proc = (0, child_process_1.spawn)(cmd, args, options);
            let out = '';
            (_a = proc.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                data = data.toString();
                console.log(data);
                out += data;
            });
            let err = '';
            (_b = proc.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
                data = data.toString();
                console.error(data);
                err += data;
            });
            proc.on('close', (code) => {
                if (code === 0)
                    resolve(out);
                const error = new Error(err);
                Object.assign(error, { code });
                reject(error);
            });
            proc.on('error', (err) => {
                reject(err);
            });
        });
    });
}
exports.runCmd = runCmd;


/***/ }),

/***/ 493:
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),

/***/ 37:
/***/ ((module) => {

module.exports = require("os");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(177);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;