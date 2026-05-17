# Copyright 2024-2026 ZeroChaos (https://github.com/zerolabnet/SSClash)
# This is free software, licensed under the GNU General Public License v2.

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-ssclash
PKG_VERSION:=4.5.1
PKG_RELEASE:=1
PKG_MAINTAINER:=ZeroChaos <dev@null.la>

LUCI_TITLE:=LuCI Support for SSClash
LUCI_DEPENDS:=+luci-base +coreutils-base64 +kmod-tun
LUCI_PKGARCH:=all

PKG_CONFIG_DEPENDS:= \
	CONFIG_PACKAGE_$(PKG_NAME)_Iptables_Transparent_Proxy \
	CONFIG_PACKAGE_$(PKG_NAME)_Nftables_Transparent_Proxy

include $(TOPDIR)/feeds/luci/luci.mk

define Package/$(PKG_NAME)/config
choice
	prompt "Transparent Proxy Backend for SSClash"
	default PACKAGE_$(PKG_NAME)_Iptables_Transparent_Proxy if !PACKAGE_firewall4
	default PACKAGE_$(PKG_NAME)_Nftables_Transparent_Proxy if PACKAGE_firewall4

config PACKAGE_$(PKG_NAME)_Iptables_Transparent_Proxy
	bool "Iptables Transparent Proxy"
	select PACKAGE_iptables-mod-tproxy

config PACKAGE_$(PKG_NAME)_Nftables_Transparent_Proxy
	bool "Nftables Transparent Proxy"
	select PACKAGE_kmod-nft-tproxy

endchoice
endef

define Package/$(PKG_NAME)/conffiles
/opt/clash/config.yaml
endef

define Package/$(PKG_NAME)/preinst
#!/bin/sh
mkdir -p /opt/clash 2>/dev/null || true
[ -f /opt/clash/config.yaml ] && cp -p /opt/clash/config.yaml /opt/clash/.config.yaml.upgrade.bak
exit 0
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -f /opt/clash/.config.yaml.upgrade.bak ]; then
	mv /opt/clash/.config.yaml.upgrade.bak /opt/clash/config.yaml
	FIRST_INSTALL=0
else
	FIRST_INSTALL=1
fi
[ -n "$$IPKG_INSTROOT" ] || {
	mkdir -p /opt/clash/lst
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null

	# On first install the default config.yaml is just a usable example
	# (no real proxies configured). Prevent auto-start on next boot so the
	# user can edit /opt/clash/config.yaml first. "Start Service" in LuCI
	# re-enables it via `/etc/init.d/clash enable`.
	if [ "$$FIRST_INSTALL" = "1" ]; then
		/etc/init.d/clash disable 2>/dev/null || true
	fi

	# Ensure periodic clash-rules update cron job exists
	CRON_FILE="/etc/crontabs/root"
	CRON_LINE="*/30 * * * * /opt/clash/bin/clash-rules update >/dev/null 2>&1"

	[ -f "$$CRON_FILE" ] || touch "$$CRON_FILE"
	if ! grep -Fq "/opt/clash/bin/clash-rules update" "$$CRON_FILE" 2>/dev/null; then
		echo "$$CRON_LINE" >> "$$CRON_FILE"
		/etc/init.d/cron restart >/dev/null 2>&1 || true
	fi
}
exit 0
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || {
	# Clean up cron job for clash-rules update, if present
	CRON_FILE="/etc/crontabs/root"
	if [ -f "$$CRON_FILE" ]; then
		sed -i '\|/opt/clash/bin/clash-rules update|d' "$$CRON_FILE" 2>/dev/null || true
		/etc/init.d/cron restart >/dev/null 2>&1 || true
	fi

	rm -rf /opt/clash/ui
	rm -f /opt/clash/ruleset
	rm -f /opt/clash/.dns_backup
	rm -rf /tmp/clash
	rm -rf /www/luci-static/resources/view/ssclash
	rm -f /usr/lib/lua/luci/i18n/ssclash.*.lmo
	rm -f /opt/clash/.config.yaml.upgrade.bak
	rm -f /etc/hotplug.d/iface/40-clash
	rm -f /etc/hotplug.d/net/99-clash-tun
	rm -f /etc/apk/protected_paths.d/ssclash.list
}
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
