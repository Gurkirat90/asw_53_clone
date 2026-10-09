# shared/

Cross-stack test fixtures (for example DNS record validation cases) consumed by both the backend
(pytest) and frontend (Vitest) test suites. Fixtures are added from PROMPT 03 onward. Use only
reserved example data: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32,
example.com / example.net, and `*.invalid`.
