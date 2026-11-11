"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const SECRET = process.env.JWT_SECRET || 'fallback_secret_change_this';
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, SECRET, { expiresIn: '8h' });
}
function verifyToken(token) {
    return jsonwebtoken_1.default.verify(token, SECRET);
}
