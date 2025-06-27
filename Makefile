# Copyright 2024-2025 ZeroChaos (https://github.com/zerolabnet/ssclash)
# This is free software, licensed under the GNU General Public License v2.

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-ssclash
PKG_VERSION:=1.9.0
PKG_RELEASE:=1
PKG_MAINTAINER:=ZeroChaos <dev@null.la>

LUCI_TITLE:=LuCI Support for SSClash
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=$(LUCI_TITLE)
  DEPENDS:=$(LUCI_DEPENDS)
  PKGARCH:=$(LUCI_PKGARCH)
endef

define Package/$(PKG_NAME)/description
  LuCI interface for SSClash, a tool for managing and configuring Clash.
endef

define Build/Prepare
	# No preparation steps required
endef

define Build/Compile
	# No compilation steps required
endef

define Package/$(PKG_NAME)/conffiles
/opt/clash/config.yaml
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./rootfs/etc/init.d/clash $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/opt/clash/bin
	$(INSTALL_BIN) ./rootfs/opt/clash/bin/clash-rules $(1)/opt/clash/bin/

	$(INSTALL_DIR) $(1)/opt/clash
	$(INSTALL_DATA) ./rootfs/opt/clash/config.yaml $(1)/opt/clash/

	$(INSTALL_DIR) $(1)/opt/clash/ui
	$(CP) ./rootfs/opt/clash/ui/* $(1)/opt/clash/ui/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./rootfs/usr/share/luci/menu.d/luci-app-ssclash.json $(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./rootfs/usr/share/rpcd/acl.d/luci-app-ssclash.json $(1)/usr/share/rpcd/acl.d/

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/ssclash
	$(CP) ./rootfs/www/luci-static/resources/view/ssclash/* $(1)/www/luci-static/resources/view/ssclash/
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || {
	rm -rf /opt/clash/ui
	rm -f /opt/clash/ruleset
	rm -rf /tmp/clash
	rm -rf /www/luci-static/resources/view/ssclash
}
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
