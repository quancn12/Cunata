import { scryptSync, randomBytes, createHash, timingSafeEqual } from './_node.js';
export function hashPassword(password, salt) {
    return scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password, salt, expectedHashHex) {
    try {
        const computed = scryptSync(password, salt, 64);
        const expected = Buffer.from(expectedHashHex, 'hex');
        if (computed.length !== expected.length)
            return false;
        return timingSafeEqual(computed, expected);
    }
    catch {
        return false;
    }
}
export function generateToken() {
    return randomBytes(32).toString('hex');
}
export function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}
export const CLASS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateClassCode(isTaken) {
    for (let tries = 0; tries < 1000; tries++) {
        const bytes = randomBytes(6);
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += CLASS_CODE_ALPHABET[bytes[i] % CLASS_CODE_ALPHABET.length];
        }
        if (code.length === 6 && !isTaken(code)) {
            return code;
        }
    }
    throw new Error('SERVER_BUSY: Chưa tạo được mã lớp, vui lòng thử lại');
}
