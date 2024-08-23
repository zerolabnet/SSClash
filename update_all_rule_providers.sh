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

# Service restart
/etc/init.d/clash reload