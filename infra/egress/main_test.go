package main

import (
	"context"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/stripe/smokescreen/pkg/smokescreen"
)

// The wrapper's two additions, and the configuration it starts with (smokescreen.yaml). The image
// is not built unless these pass (Dockerfile).

func loadConfig(t *testing.T) *smokescreen.Config {
	t.Helper()
	conf, err := smokescreen.LoadConfig("smokescreen.yaml")
	if err != nil {
		t.Fatalf("smokescreen.yaml: %v", err)
	}
	return conf
}

func TestConfigHasTheBrowsersProxysLimits(t *testing.T) {
	conf := loadConfig(t)
	for name, got := range map[string]time.Duration{
		"connect_timeout":     conf.ConnectTimeout,
		"idle_timeout":        conf.IdleTimeout,
		"read_header_timeout": conf.ReadHeaderTimeout,
	} {
		if got <= 0 || got > 30*time.Second {
			t.Errorf("%s is %v, not a limit of 30 s at most", name, got)
		}
	}
	if conf.MaxConcurrentConnectTunnels <= 0 {
		t.Errorf("max_concurrent_connect_tunnels is %d: no limit", conf.MaxConcurrentConnectTunnels)
	}
}

func TestDenyServerNeedsAnAddress(t *testing.T) {
	for _, value := range []string{"", " ", " , ,"} {
		if err := denyServer(loadConfig(t), value); err == nil {
			t.Errorf("%q: started without the server's address", value)
		}
	}
}

func TestDenyServerAddsEachRangeOnce(t *testing.T) {
	conf := loadConfig(t)
	before := len(conf.DenyRanges)
	if err := denyServer(conf, " 203.0.113.7/32 , 198.51.100.0/24 "); err != nil {
		t.Fatal(err)
	}
	if got := len(conf.DenyRanges); got != before+2 {
		t.Fatalf("%d ranges, want %d", got, before+2)
	}
	for i, want := range []string{"203.0.113.7/32", "198.51.100.0/24"} {
		if got := conf.DenyRanges[before+i].Net.String(); got != want {
			t.Errorf("range %d is %s, want %s", before+i, got, want)
		}
	}
}

// The server's own IPv6 address is refused as its IPv4 one is: a name that points at it would
// reach the host's own services (ARABLYZER_DENY_CIDRS names both).
func TestDenyServerAddsIPv6Ranges(t *testing.T) {
	conf := loadConfig(t)
	before := len(conf.DenyRanges)
	if err := denyServer(conf, "203.0.113.7/32, 2a01:4f8:c17:1234::1/128, 2a01:4f8:c17:1235::/64"); err != nil {
		t.Fatal(err)
	}
	added := conf.DenyRanges[before:]
	if len(added) != 3 {
		t.Fatalf("%d ranges added, want 3", len(added))
	}
	for _, c := range []struct {
		address string
		refused bool
	}{
		{"203.0.113.7", true},
		{"203.0.113.8", false},
		{"2a01:4f8:c17:1234::1", true},
		{"2a01:4f8:c17:1234::2", false},
		{"2a01:4f8:c17:1235::1", true},
		{"2a01:4f8:c17:1235:ffff:ffff:ffff:ffff", true},
		{"2a01:4f8:c17:1236::1", false},
	} {
		ip := net.ParseIP(c.address)
		got := false
		for _, r := range added {
			got = got || r.Net.Contains(ip)
		}
		if got != c.refused {
			t.Errorf("%s: refused %v, want %v", c.address, got, c.refused)
		}
	}
}

// The same spellings the egress package refuses (packages/egress denyCidr): the proxy's own
// parser refuses them, and starting on a list it cannot read is the safe answer.
func TestDenyServerRefusesWhatIsNotACIDR(t *testing.T) {
	for _, value := range []string{
		"203.0.113.7", "203.0.113.0/33", "server.example",
		"2001:db8::7", "2001:db8::7/129", "fe80::1%eth0/64", "[2001:db8::7]/128",
		"203.0.113/24", "0x7f.1/8", "203.000.113.007/32",
		"203.0.113.7/32, 198.51.100.9",
	} {
		if err := denyServer(loadConfig(t), value); err == nil {
			t.Errorf("%q: accepted", value)
		}
	}
}

func TestPortAllowed(t *testing.T) {
	for address, allowed := range map[string]bool{
		"93.184.215.50:80":     true,
		"93.184.215.50:443":    true,
		"[2001:db8::1]:443":    true,
		"93.184.215.50:8080":   false,
		"93.184.215.50:22":     false,
		"[2001:db8::1]:6379":   false,
		"93.184.215.50":        false,
		"93.184.215.50:80:443": false,
	} {
		if err := portAllowed(address); (err == nil) != allowed {
			t.Errorf("%s: allowed %v, want %v", address, err == nil, allowed)
		}
	}
}

func TestDialAllowedRefusesOtherPortsBeforeDialling(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	accepted := make(chan struct{}, 1)
	go func() {
		if conn, err := listener.Accept(); err == nil {
			accepted <- struct{}{}
			conn.Close()
		}
	}()
	conn, err := dialAllowed(context.Background(), "tcp", listener.Addr().String(), time.Second)
	if err == nil {
		conn.Close()
		t.Fatal("dialled a port other than 80 and 443")
	}
	if !strings.Contains(err.Error(), "80 and 443 alone") {
		t.Errorf("refused with %v", err)
	}
	select {
	case <-accepted:
		t.Error("the refused port saw a connection")
	case <-time.After(200 * time.Millisecond):
	}
}
