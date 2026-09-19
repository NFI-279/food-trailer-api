import { getJwtSecret, validateSecurityConfiguration } from './security.config';

describe('security configuration', () => {
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('rejects a missing JWT secret', () => {
    delete process.env.JWT_SECRET;

    expect(() => validateSecurityConfiguration()).toThrow(
      'JWT_SECRET must be configured',
    );
  });

  it('rejects weak JWT secrets', () => {
    process.env.JWT_SECRET = 'short-secret';

    expect(() => getJwtSecret()).toThrow(
      'JWT_SECRET must be configured',
    );
  });

  it('returns a configured strong JWT secret', () => {
    process.env.JWT_SECRET = 'a-secure-secret-that-is-at-least-32-chars';

    expect(getJwtSecret()).toBe(process.env.JWT_SECRET);
  });
});
