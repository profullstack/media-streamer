## Description

<!-- Describe your changes in detail -->

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)

## Submission Payout

- [ ] PR: $100 minimum per accepted PR
- [ ] Bug fix: $100 minimum per confirmed bug fix
- [ ] QA run: $250 minimum per QA run (files bugs and/or fixes them)
- [ ] Feature/fix: $100 minimum per accepted feature implementation or substantive fix

## TDD Checklist (MANDATORY)

**All items must be checked before merge:**

- [ ] Tests written FIRST (before implementation)
- [ ] All new code has corresponding tests
- [ ] All tests pass locally (`pnpm test`)
- [ ] Edge cases are covered
- [ ] No `any` types used (unless explicitly justified)
- [ ] TypeScript strict mode passes (`pnpm tsc --noEmit`)
- [ ] ESLint passes (`pnpm lint`)

## Security Checklist

- [ ] No Supabase calls from client-side code
- [ ] No sensitive data exposed in client bundle
- [ ] Input validation implemented
- [ ] Rate limiting considered (if applicable)

## Testing

<!-- Describe the tests you've added -->

### Test Coverage

- Number of new tests: 
- Test file(s) modified/created:

### How to Test

1. 
2. 
3. 

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## Related Issues

<!-- Link any related issues -->

Closes #

## Additional Notes

<!-- Any additional information -->
