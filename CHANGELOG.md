# Changelog

## [1.12.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.11.6...v1.12.0) (2026-02-20)


### Features

* refactor outcome logic ([#189](https://github.com/stainless-api/upload-openapi-spec-action/issues/189)) ([cec1106](https://github.com/stainless-api/upload-openapi-spec-action/commit/cec11060b292826e929d94a08379ffbb86317299))


### Bug Fixes

* allow multi-line conventional commits ([#177](https://github.com/stainless-api/upload-openapi-spec-action/issues/177)) ([0079085](https://github.com/stainless-api/upload-openapi-spec-action/commit/0079085539102bb10b95abbdd3652b72ccb4a83d))
* fix display for pending results ([#179](https://github.com/stainless-api/upload-openapi-spec-action/issues/179)) ([89af7c3](https://github.com/stainless-api/upload-openapi-spec-action/commit/89af7c3871f904027141077b9e3afb88f60bb5e4))

## [1.11.6](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.11.5...v1.11.6) (2026-02-03)


### Bug Fixes

* yaml formatting ([c9df677](https://github.com/stainless-api/upload-openapi-spec-action/commit/c9df67766188af19676071bb5d44b6ef7da26cfd))

## [1.11.5](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.11.4...v1.11.5) (2026-01-30)


### Bug Fixes

* **comment:** add install instructions for java, cli ([#171](https://github.com/stainless-api/upload-openapi-spec-action/issues/171)) ([9f22f23](https://github.com/stainless-api/upload-openapi-spec-action/commit/9f22f23be86aa881a863eea93a699871f39df0e8))
* save and reapply config patch instead of whole config ([#172](https://github.com/stainless-api/upload-openapi-spec-action/issues/172)) ([15947cf](https://github.com/stainless-api/upload-openapi-spec-action/commit/15947cf20f36b6b7024ee059d587951eda7091c9))

## [1.11.4](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.11.3...v1.11.4) (2026-01-27)


### Bug Fixes

* refresh token in fetch if needed ([#169](https://github.com/stainless-api/upload-openapi-spec-action/issues/169)) ([62540f2](https://github.com/stainless-api/upload-openapi-spec-action/commit/62540f26f52c69d8e82f6ce4366e05544f3d13ab))

## [1.11.3](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.11.2...v1.11.3) (2026-01-27)


### Bug Fixes

* revert refresh for OIDC token ([#167](https://github.com/stainless-api/upload-openapi-spec-action/issues/167)) ([8229a89](https://github.com/stainless-api/upload-openapi-spec-action/commit/8229a8959722956693e0abc53fdf155ed642bddd))

## [1.11.2](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.11.1...v1.11.2) (2026-01-26)


### Bug Fixes

* add refresh for OIDC token ([#165](https://github.com/stainless-api/upload-openapi-spec-action/issues/165)) ([9b04055](https://github.com/stainless-api/upload-openapi-spec-action/commit/9b04055f28435f279a9ea7a7070dcbeabb56ff2a))

## [1.11.1](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.11.0...v1.11.1) (2026-01-23)


### Bug Fixes

* save config in merge action (and add more logging) ([#163](https://github.com/stainless-api/upload-openapi-spec-action/issues/163)) ([9f0a042](https://github.com/stainless-api/upload-openapi-spec-action/commit/9f0a0426cc59606833d37c1f50f6029ec1991837))

## [1.11.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.10.0...v1.11.0) (2026-01-14)


### Features

* add action to combine multiple OpenAPI specs ([#158](https://github.com/stainless-api/upload-openapi-spec-action/issues/158)) ([a5690fa](https://github.com/stainless-api/upload-openapi-spec-action/commit/a5690fa951806486720f35328b5b7555ec2836f1))

## [1.9.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.8.1...v1.9.0) (2025-12-20)


### Features

* check org-level enable_ai_commit_messages field ([#152](https://github.com/stainless-api/upload-openapi-spec-action/issues/152)) ([90deb1b](https://github.com/stainless-api/upload-openapi-spec-action/commit/90deb1bcc4b5bd0d72407720066c9d73bbe6823e))

## [1.8.1](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.8.0...v1.8.1) (2025-12-09)


### Bug Fixes

* re-enable 'targets' param in diagnostics call ([#148](https://github.com/stainless-api/upload-openapi-spec-action/issues/148)) ([3130e17](https://github.com/stainless-api/upload-openapi-spec-action/commit/3130e17c92819fd08f6aded35d243975c4e8404c))

## [1.8.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.7.1...v1.8.0) (2025-12-08)


### Features

* support AI commit message generation for preview builds ([#143](https://github.com/stainless-api/upload-openapi-spec-action/issues/143)) ([7010edb](https://github.com/stainless-api/upload-openapi-spec-action/commit/7010edb3895df8fdb2f6e1f5b78613ffb8cd58ad))
* support per-SDK commit messages in preview comments ([#142](https://github.com/stainless-api/upload-openapi-spec-action/issues/142)) ([a36c33f](https://github.com/stainless-api/upload-openapi-spec-action/commit/a36c33fc218bd12e52b4ad01bf00d02748894f2e))
* Update to latest @stainless-api/sdk ([#144](https://github.com/stainless-api/upload-openapi-spec-action/issues/144)) ([a9b388b](https://github.com/stainless-api/upload-openapi-spec-action/commit/a9b388bdeda07821deadf90e4ad4818d5776498f))

## [1.7.1](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.7.0...v1.7.1) (2025-12-01)


### Bug Fixes

* improve getMergeBase to handle shallow clones more robustly ([#138](https://github.com/stainless-api/upload-openapi-spec-action/issues/138)) ([3687845](https://github.com/stainless-api/upload-openapi-spec-action/commit/3687845465214a98c1f18a48600f6a8c7cf60561))

## [1.7.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.6.0...v1.7.0) (2025-11-17)


### Features

* **preview:** add output documented_spec_path to preview action ([#135](https://github.com/stainless-api/upload-openapi-spec-action/issues/135)) ([5e80cc4](https://github.com/stainless-api/upload-openapi-spec-action/commit/5e80cc40da2419877875629e10f67dfc92a95fb8))
* **preview:** add output_dir input and write documented spec to file ([#137](https://github.com/stainless-api/upload-openapi-spec-action/issues/137)) ([d30490c](https://github.com/stainless-api/upload-openapi-spec-action/commit/d30490c89b9a7fd667f9ab30678a332c00cd0d98))

## [1.6.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.5.5...v1.6.0) (2025-10-30)


### Features

* add support for github OIDC auth ([#133](https://github.com/stainless-api/upload-openapi-spec-action/issues/133)) ([259674c](https://github.com/stainless-api/upload-openapi-spec-action/commit/259674c1b3969916062cf7ffe7e05ac4305ba9dd))
* change fail on semantics ([#124](https://github.com/stainless-api/upload-openapi-spec-action/issues/124)) ([e104624](https://github.com/stainless-api/upload-openapi-spec-action/commit/e1046240c0ed9d9cb4084d70f889bfe40840a6d4))


### Bug Fixes

* accept multiline conventional commits ([#129](https://github.com/stainless-api/upload-openapi-spec-action/issues/129)) ([d2dcc0b](https://github.com/stainless-api/upload-openapi-spec-action/commit/d2dcc0b3bfb698840cdc0b3bf52a28ac4e65bc55))
* tweak categorizeOutcomes ([#132](https://github.com/stainless-api/upload-openapi-spec-action/issues/132)) ([c45d6a9](https://github.com/stainless-api/upload-openapi-spec-action/commit/c45d6a9c7996dea81cf770649e24846756d463cc))

## [1.5.5](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.5.4...v1.5.5) (2025-09-26)


### Bug Fixes

* rollback filtering diagnostics by target ([54328a3](https://github.com/stainless-api/upload-openapi-spec-action/commit/54328a386f86c333576c65f3ea232bbac9cd967c))

## [1.5.4](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.5.3...v1.5.4) (2025-09-25)


### Bug Fixes

* check for latestRun before commenting ([53fef9f](https://github.com/stainless-api/upload-openapi-spec-action/commit/53fef9f3286760d15a66407789430ee6d63e94a4))
* filter diagnostics by target ([#125](https://github.com/stainless-api/upload-openapi-spec-action/issues/125)) ([102dc97](https://github.com/stainless-api/upload-openapi-spec-action/commit/102dc971cb22d692f134a4bc76319bb72b1ff7a5))

## [1.5.3](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.5.2...v1.5.3) (2025-09-16)


### Bug Fixes

* filter by branch when finding base build ([#120](https://github.com/stainless-api/upload-openapi-spec-action/issues/120)) ([b6506ad](https://github.com/stainless-api/upload-openapi-spec-action/commit/b6506adb5cb09b7fcb9e5427592fd1a7ba773e33))

## [1.5.2](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.5.1...v1.5.2) (2025-09-15)


### Bug Fixes

* fix config reading ([#119](https://github.com/stainless-api/upload-openapi-spec-action/issues/119)) ([e6234c4](https://github.com/stainless-api/upload-openapi-spec-action/commit/e6234c480691ebfd534a490249aa74d3009bd3bb))
* throw if path is given but not found ([#115](https://github.com/stainless-api/upload-openapi-spec-action/issues/115)) ([dfedffa](https://github.com/stainless-api/upload-openapi-spec-action/commit/dfedffaec97d7317ad1f2af53ae83f97c3a113dd))

## [1.5.1](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.5.0...v1.5.1) (2025-09-12)


### Bug Fixes

* **preview:** allow explicitly guess config behavior  ([#112](https://github.com/stainless-api/upload-openapi-spec-action/issues/112)) ([b631d55](https://github.com/stainless-api/upload-openapi-spec-action/commit/b631d55463f3dcecc5a43a66f8404cb409d60deb))
* **preview:** guess against given branch if it exists ([#114](https://github.com/stainless-api/upload-openapi-spec-action/issues/114)) ([10b507a](https://github.com/stainless-api/upload-openapi-spec-action/commit/10b507ae30d9ca060870fa236b790b5fde90c345))

## [1.5.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.4.1...v1.5.0) (2025-09-08)


### Features

* env variable to swap in a gitlab staging repo URL ([#108](https://github.com/stainless-api/upload-openapi-spec-action/issues/108)) ([4a2579d](https://github.com/stainless-api/upload-openapi-spec-action/commit/4a2579d2993503bba9a1d8c7fe1264e23c483269))


### Bug Fixes

* support checkout ref for gitlab and fix some bugs ([#110](https://github.com/stainless-api/upload-openapi-spec-action/issues/110)) ([d9d20d0](https://github.com/stainless-api/upload-openapi-spec-action/commit/d9d20d05de458020b8987d899b5bbfeb2f39ffac))

## [1.4.1](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.4.0...v1.4.1) (2025-09-05)


### Bug Fixes

* do not stringify YAML twice ([#105](https://github.com/stainless-api/upload-openapi-spec-action/issues/105)) ([5238e56](https://github.com/stainless-api/upload-openapi-spec-action/commit/5238e564a822898f088c84611f6b075f13977b55))

## [1.4.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.3.2...v1.4.0) (2025-08-20)


### Features

* use install_url in preview comment  ([#101](https://github.com/stainless-api/upload-openapi-spec-action/issues/101)) ([a897e5c](https://github.com/stainless-api/upload-openapi-spec-action/commit/a897e5cd5229d563f47403800a7e368cf18cd428))


### Bug Fixes

* improve comment format ([#100](https://github.com/stainless-api/upload-openapi-spec-action/issues/100)) ([caaf31f](https://github.com/stainless-api/upload-openapi-spec-action/commit/caaf31fca3ed970e0a2d80b8f0242d4e1feb6a2c))
* trigger release ([#97](https://github.com/stainless-api/upload-openapi-spec-action/issues/97)) ([309add6](https://github.com/stainless-api/upload-openapi-spec-action/commit/309add646574e0ceef714e937ce7c9f496cd18f2))

## [1.3.2](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.3.1...v1.3.2) (2025-07-18)


### Bug Fixes

* trigger release ([#97](https://github.com/stainless-api/upload-openapi-spec-action/issues/97)) ([309add6](https://github.com/stainless-api/upload-openapi-spec-action/commit/309add646574e0ceef714e937ce7c9f496cd18f2))

## [1.3.1](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.3.0...v1.3.1) (2025-07-17)


### Bug Fixes

* read oas and config even if not checked into git ([#91](https://github.com/stainless-api/upload-openapi-spec-action/issues/91)) ([0206ac3](https://github.com/stainless-api/upload-openapi-spec-action/commit/0206ac303878206499d68f55109377c8723e9ae4))

## [1.3.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.2.2...v1.3.0) (2025-07-17)


### Features

* show more things in the comment while pending  ([#87](https://github.com/stainless-api/upload-openapi-spec-action/issues/87)) ([a0975f0](https://github.com/stainless-api/upload-openapi-spec-action/commit/a0975f0883327437a0dc469d1fd8369af459c998))


### Bug Fixes

* await for config reads before comparing ([#88](https://github.com/stainless-api/upload-openapi-spec-action/issues/88)) ([deb361d](https://github.com/stainless-api/upload-openapi-spec-action/commit/deb361d06abef732d0305c225d7ae76ce2f09d1f))

## [1.2.2](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.2.1...v1.2.2) (2025-07-16)


### Bug Fixes

* remove git usage in saving config files ([#85](https://github.com/stainless-api/upload-openapi-spec-action/issues/85)) ([1cb5235](https://github.com/stainless-api/upload-openapi-spec-action/commit/1cb5235b1cdbada0b00f3ee281c6224d04b64f2c))

## [1.2.1](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.2.0...v1.2.1) (2025-07-16)


### Bug Fixes

* fix preview action checking for saved config ([#83](https://github.com/stainless-api/upload-openapi-spec-action/issues/83)) ([d8f0fba](https://github.com/stainless-api/upload-openapi-spec-action/commit/d8f0fbaa30e35d21b7f43d4aa592a796b1a962e5))

## [1.2.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.1.1...v1.2.0) (2025-07-16)


### Features

* add go installation instructions ([#82](https://github.com/stainless-api/upload-openapi-spec-action/issues/82)) ([bc77dbc](https://github.com/stainless-api/upload-openapi-spec-action/commit/bc77dbca81711b91e93bc1520d9a452445220809))
* add preview support for generating oas ([#74](https://github.com/stainless-api/upload-openapi-spec-action/issues/74)) ([4a0529f](https://github.com/stainless-api/upload-openapi-spec-action/commit/4a0529ff71b96dcbd74c766a7ee938d618c53c4e))


### Bug Fixes

* don't fail action on merge conflicts ([#80](https://github.com/stainless-api/upload-openapi-spec-action/issues/80)) ([e2821aa](https://github.com/stainless-api/upload-openapi-spec-action/commit/e2821aa4c01149a9d2c36933eeb6f648c0b69808))

## [1.1.1](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.1.0...v1.1.1) (2025-07-14)


### Bug Fixes

* path to build.js ([#77](https://github.com/stainless-api/upload-openapi-spec-action/issues/77)) ([47cd71f](https://github.com/stainless-api/upload-openapi-spec-action/commit/47cd71fd770c17022e308e989679d4c146a6b9b8))

## [1.1.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v1.0.0...v1.1.0) (2025-07-11)


### Features

* add gitlab ci support ([#73](https://github.com/stainless-api/upload-openapi-spec-action/issues/73)) ([27f29a9](https://github.com/stainless-api/upload-openapi-spec-action/commit/27f29a9cf3ed65668e083cfffbc82f552b41a1aa))
* improve comment contents-again ([#75](https://github.com/stainless-api/upload-openapi-spec-action/issues/75)) ([a1358ef](https://github.com/stainless-api/upload-openapi-spec-action/commit/a1358efebc0bf7b362f99615d1934cfa4148ff05))

## [1.0.0](https://github.com/stainless-api/upload-openapi-spec-action/compare/v0.5.0...v1.0.0) (2025-07-09)


### Features

* merge next branch into main ([#70](https://github.com/stainless-api/upload-openapi-spec-action/issues/70)) ([15b8b59](https://github.com/stainless-api/upload-openapi-spec-action/commit/15b8b599f60239a1bcf794439809b8a2d8c9112b))


### Miscellaneous Chores

* release 1.0.0 ([08eca69](https://github.com/stainless-api/upload-openapi-spec-action/commit/08eca690723370252b0e68ffcf6387bdda803c01))
