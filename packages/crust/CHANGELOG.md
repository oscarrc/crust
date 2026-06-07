# Changelog

## [0.2.0](https://github.com/oscarrc/crust/compare/crust-v0.1.0...crust-v0.2.0) (2026-06-07)


### ⚠ BREAKING CHANGES

* **crust:** `toast(message, { title })` is now `toast(title, { message })`. `Toast.title` is required and `Toast.message` optional; expandability is keyed on `message` instead of `title`, and `PromiseMessages` content objects are `{ title, message? }`.

### Features

* **crust:** add max height for toast messages and improve scrollbar styling ([94016b2](https://github.com/oscarrc/crust/commit/94016b2557fc4caeb9f51210ae1402547a124749))
* **crust:** implement swipe-to-dismiss functionality for toast notifications ([0945d06](https://github.com/oscarrc/crust/commit/0945d06694a55193ca9b0f222828b0a851c2e161))
* **crust:** make title the mandatory positional argument ([7b6e89c](https://github.com/oscarrc/crust/commit/7b6e89c4ab87a58b0775e42741ba9f8111fce0bc))

## 0.1.0 (2026-06-06)


### Features

* **crust:** expandAfter option — auto-expand on a visibility-anchored timer ([ada3aab](https://github.com/oscarrc/crust/commit/ada3aab46e24dc9e8e33aba6601c43687083723c))
* **crust:** expanded toast primitive with timer-restart semantics ([b56073b](https://github.com/oscarrc/crust/commit/b56073b70b4f34fc821f218b671c25abe8a4da1d))
* **crust:** expanded toasts close their morph before exiting ([f40d485](https://github.com/oscarrc/crust/commit/f40d4859d0c2f91b3bbe9b35410e81fc42150906))
* **crust:** expandOnSettle option for toast.promise ([68b469f](https://github.com/oscarrc/crust/commit/68b469f67b337574dc3a8478d977d6e7a9c03111))
* **crust:** React bridge — Toaster wrapper and useToasts hook ([16d030f](https://github.com/oscarrc/crust/commit/16d030fc5b41967c2187488e5af3a9f16c7a625e))
* **crust:** render store-driven expansion as pinned-open ([6d37ef7](https://github.com/oscarrc/crust/commit/6d37ef71b74b001945e2faf8e0af545c6c69674e))
* **crust:** toast store with queue, timers, pause/resume ([bdeca86](https://github.com/oscarrc/crust/commit/bdeca868862a4f9d3ac3c9fc26fbbd0830867c88))
* **crust:** vanilla DOM renderer with morph-expand, a11y, icon overrides ([9d8c44a](https://github.com/oscarrc/crust/commit/9d8c44a8812dde810884103c0d7bced52c07d219))
* **crust:** warm-paper design system with morph and draw-in motion ([45da019](https://github.com/oscarrc/crust/commit/45da019294d16db10e268dce48e4f199cbc13f4c))
* **crust:** warning and loading types, toast.update, toast.promise ([da95493](https://github.com/oscarrc/crust/commit/da954938c8ffaf47a83381ed8f05883be20d2679))


### Bug Fixes

* **crust:** animate programmatic expansion like hover; user collapse wins across updates ([328fbae](https://github.com/oscarrc/crust/commit/328fbae1cdadaebe29839d616bd35ab5055232ed))
* **crust:** exclude hidden message from collapsed toast intrinsic width ([8126b0f](https://github.com/oscarrc/crust/commit/8126b0f45a76b275b6396e626ad50d9c8960ea0b))
* **crust:** expanded toasts exit in one continuous reverse motion ([017014f](https://github.com/oscarrc/crust/commit/017014f421e7bec17ec15c6d23a30d134a42b0d0))
* **crust:** expansion-only updates act on the live element like hover ([8d53370](https://github.com/oscarrc/crust/commit/8d533706fa16859f60ff96f7a836a622b298e88f))
* **crust:** fix docs page ensuring button functionality ([bb92db8](https://github.com/oscarrc/crust/commit/bb92db882ca021bb441a228a739f5ddd109087bb))
* **crust:** guard expand timer rescheduling; cover hover-paused expand ([da1b415](https://github.com/oscarrc/crust/commit/da1b415acc8134fed060f5bfe23c32e9d80ab646))
* **crust:** keep paused toasts paused when their timer restarts ([49f932c](https://github.com/oscarrc/crust/commit/49f932c6e15f940c26b2d24fd6ca4c1d857662ac))
* **crust:** pin dismiss button to the toast's top-right when expanded ([9459246](https://github.com/oscarrc/crust/commit/9459246d57a1552b0a3bca39d0f63edb718882d4))
* **crust:** stale toaster handle unmount no longer orphans the active mount ([71a5dc7](https://github.com/oscarrc/crust/commit/71a5dc739d295014288b23ea17f81766568f723c))
