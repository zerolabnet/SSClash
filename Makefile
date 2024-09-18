# Copyright 2024 ZeroChaos (https://github.com/zerolabnet/ssclash)
# This is free software, licensed under the GNU General Public License v2.

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-ssclash
PKG_VERSION:=1.5
PKG_RELEASE:=1
PKG_MAINTAINER:=ZeroChaos <dev@null.la>

PKGARCH:=all
LUCI_TITLE:=LuCI Support for ssclash
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
  LuCI interface for ssclash, a tool for managing and configuring Clash.
endef

define Build/Prepare
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./rootfs/etc/init.d/clash $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/opt/clash/bin
	$(INSTALL_BIN) ./rootfs/opt/clash/bin/clash-rules $(1)/opt/clash/bin/

	$(INSTALL_DIR) $(1)/opt/clash
	$(CP) ./rootfs/opt/clash/config.yaml.default $(1)/opt/clash/
	$(INSTALL_BIN) ./rootfs/opt/clash/nft.conf $(1)/opt/clash/

	$(INSTALL_DIR) $(1)/opt/clash/ui
	$(CP) ./rootfs/opt/clash/ui/* $(1)/opt/clash/ui/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(CP) ./rootfs/usr/share/luci/menu.d/luci-app-ssclash.json $(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(CP) ./rootfs/usr/share/rpcd/acl.d/luci-app-ssclash.json $(1)/usr/share/rpcd/acl.d/

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/ssclash
	$(CP) ./rootfs/www/luci-static/resources/view/ssclash/* $(1)/www/luci-static/resources/view/ssclash/
endef

define Package/$(PKG_NAME)/postinst
	if [ ! -f /opt/clash/config.yaml ]; then \
		cp /opt/clash/config.yaml.default /opt/clash/config.yaml; \
	fi
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
