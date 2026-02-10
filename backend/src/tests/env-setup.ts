// Runs before test files load so auth middleware sees INTERNAL_API_KEY
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';
