<h1 align="center">
  <img src="Meta.png" alt="Meta Kernel" width="200">
  <br>Meta Kernel<br>
</h1>

<h3 align="center">Here's the step-by-step process for installing and configuring ssclash on your OpenWrt router</h3>

# Setup Guide

## Step 1: Update Package List
Update the package list to ensure you have the latest available versions.

```bash
opkg update
```

## Step 2: Install Required Packages
Install the necessary kernel module for nftables.

```bash
opkg install kmod-nft-tproxy
```

For iptables (if you have OpenWrt version < 22.03.x) – `iptables-mod-tproxy`.

## Step 3: Set Up Clash Directory
Create the Clash directory and navigate to it.

```bash
mkdir -p /opt/clash
cd /opt/clash
```

## Step 4: Download and Extract Clash Package
Download the ssclash package and extract it.

```bash
curl -L https://github.com/zerolabnet/ssclash/releases/download/v1.2/ssclash-v1.2.tar.gz -o ssclash-v1.2.tar.gz
tar zxvf ssclash-v1.2.tar.gz
```

## Step 5: Move Files to Appropriate Directories
Move the necessary files to their respective directories.

```bash
mv rootfs/etc/init.d/clash /etc/init.d/
mv rootfs/opt/clash/* .
rm -rf rootfs
rm -rf ssclash-v1.2.tar.gz
```

## Step 6: Download Clash.Meta Kernel
Navigate to the `bin` directory and download the Clash.Meta Kernel. Choose the appropriate architecture.

For **amd64** architecture:

```bash
cd /opt/clash/bin
curl -L https://github.com/MetaCubeX/mihomo/releases/download/v1.18.7/mihomo-linux-amd64-compatible-v1.18.7.gz -o clash.gz
```

For **mipsel_24kc** architecture:

```bash
curl -L https://github.com/MetaCubeX/mihomo/releases/download/v1.18.7/mihomo-linux-mipsle-softfloat-v1.18.7.gz -o clash.gz
```

Need a different architecture? Visit the [MetaCubeX Release Page](https://github.com/MetaCubeX/mihomo/releases) and choose the one that matches your device.

## Step 7: Prepare the Clash Binary
Decompress the downloaded file and make it executable.

```bash
gunzip clash.gz
chmod +x clash
```

## Step 8: Enable Clash
Enable the Clash service.

```bash
/etc/init.d/clash enable
```

## Step 9: Managing Clash from LUCI interface
I've written a simple interface for managing Clash from LUCI interface `luci-app-ssclash`. Edit Clash config and Apply.

<p align="center">
 <img src="scr-00.png" width="100%">
</p>

## Step 10: You can access to Dashboard from LUCI interface or manual
You can access the Dashboard at:

```
http://ROUTER_IP:9090/ui/
```

<p align="center">
 <img src="scr-01.png" width="100%">
</p>

# Remove Clash
To remove Clash, stop the service, delete the related files and kernel module `kmod-nft-tproxy` or `iptables-mod-tproxy`.

```bash
/etc/init.d/clash stop
rm -f /etc/init.d/clash
rm -rf /opt/clash
rm -f /usr/share/luci/menu.d/luci-app-ssclash.json
rm -f /usr/share/rpcd/acl.d/luci-app-ssclash.json
rm -rf /www/luci-static/resources/view/ssclash
```

---

# Extra info (optional): Automating Clash Rules Update in OpenWrt whenever the Internet interface is brought up

To automatically update the rules for Clash whenever the Internet interface is brought up in OpenWrt, follow these step:

## Create the Shell Script

1. Open a terminal and create a new shell script named `40-clash_rules` in the `/etc/hotplug.d/iface/` directory:

```bash
vi /etc/hotplug.d/iface/40-clash_rules
```

2. [Insert the following script content](https://raw.githubusercontent.com/zerolabnet/ssclash/main/update_all_rule_providers.sh) (change `api_base_url` if needed):

```sh
#!/bin/sh

# Add delay
sleep 10

# API IP address and port
api_base_url="http://192.168.1.1:9090"

# API URL
base_url="$api_base_url/providers/rules"

# Get JSON response with provider names
response=$(curl -s "$base_url")

# Extract provider names using standard utilities
providers=$(echo "$response" | grep -o '"name":"[^"]*"' | sed 's/"name":"\([^"]*\)"/\1/')

# Check if data retrieval was successful
if [ -z "$providers" ]; then
  echo "Failed to retrieve providers or no providers found."
  exit 1
fi

# Loop through each provider name and send PUT request to update
for provider in $providers; do
  echo "Updating provider: $provider"
  curl -X PUT "$base_url/$provider"

  # Check success and output the result
  if [ $? -eq 0 ]; then
    echo "Successfully updated $provider"
  else
    echo "Failed to update $provider"
  fi
done
```

3. Save and exit the editor.

The script will now automatically run whenever the Internet interface is brought up. This ensures that the rules for Clash are updated as soon as the router is rebooted and connected to the Internet.
