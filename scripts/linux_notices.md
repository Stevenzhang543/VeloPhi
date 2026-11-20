## System libraries in the Linux AppImage (26.65) / Linux AppImage 中携带的系统库

This section is kept by hand in `scripts/linux_notices.md`; the table below it is generated from
`scripts/linux/appimage-source-packages.txt` (the Ubuntu source packages of the libraries in the AppImage, written by
`scripts/linux/build-linux.sh` into the release evidence as `linux/appimage-source-packages.txt`) and
`scripts/linux/appimage-licenses.json` (the licence of the libraries each package ships, read from its copyright file).
本节手工维护；下表由构建证据中的软件包清单与许可证对照表生成。

- The **deb** and **rpm** packages contain only VeloPhi's own program, icons and desktop files. WebKitGTK, GTK and the other
  system libraries come from the distribution and are installed by its package manager; VeloPhi does not redistribute them.
  deb 与 rpm 包只含 VeloPhi 自身的程序、图标与桌面文件，WebKitGTK、GTK 等系统库由发行版的包管理器安装，VeloPhi 不分发它们。
- The **AppImage** carries, unmodified, the shared libraries of Ubuntu 22.04 LTS listed below (WebKitGTK 4.1, GTK 3,
  GLib, GStreamer and their dependencies), so that it runs on distributions that do not have them. Each library stays a
  separate shared object that the AppImage's loader finds at start; a recipient may replace any of them with a
  compatible build (extract with `--appimage-extract`, swap the file in `usr/lib`, run `AppRun`).
  AppImage 原样携带下列 Ubuntu 22.04 LTS 的共享库，每个库都是独立的共享对象，可以用兼容版本替换（`--appimage-extract` 解包后替换 `usr/lib` 中的文件再运行 `AppRun`）。
- **Source code.** The complete corresponding source code of every listed package, at the listed version, including the
  Ubuntu patches, is published by Canonical at `https://launchpad.net/ubuntu/+source/<package>/<version>` and by
  `apt-get source <package>=<version>` on Ubuntu 22.04. On request to the VeloPhi project
  (https://github.com/Stevenzhang543/VeloPhi/issues), the maintainer provides the same source code for at least three
  years after the release that carried it, at no more than the cost of physically performing the distribution.
  每个软件包对应版本的完整源代码（含 Ubuntu 补丁）由 Canonical 公开发布；如需，也可在 VeloPhi 项目提出，维护者在相应版本发布后至少三年内按不超过实际分发成本的费用提供。
- **GStreamer plugins left out.** linuxdeploy copies every GStreamer plugin of the build system. Since 26.65 plugins
  that WebKit never loads are left out (`aasink`, `cacasink`, `1394`, `dv`, `shout2`, `cdparanoia`, `libvisual`, `jack`,
  `oss4`, `ossaudio`, `video4linux2`; see `scripts/linux/build-linux.sh`) — among them the two that would pull in libraries
  under the GPL without a library exception (libaa and libcaca bring S-Lang and gpm).
  自 26.65 起，WebKit 从不加载的 GStreamer 插件不再打包，其中两个会带入无库例外的 GPL 库（S-Lang、gpm）。
- The texts of the licences named in the table (GNU GPL 2 and 3, GNU LGPL 2, 2.1 and 3, MPL 1.1, Apache 2.0; taken from
  `/usr/share/common-licenses` of Ubuntu 22.04) are in *License texts* at the end, under the § numbers given after the table.
  Each package's own copyright file, with all authors, is at `/usr/share/doc/<binary package>/copyright` on Ubuntu 22.04.
