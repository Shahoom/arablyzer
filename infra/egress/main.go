// The egress proxy of Arablyzer's containers (M2.1 plan §5b): Smokescreen, which resolves every
// name itself and refuses the addresses the egress package refuses (smokescreen.yaml), with two
// additions of Arablyzer's own. It dials ports 80 and 443 alone (BUILD-PLAN §13), and it refuses
// the server's own public address, from ARABLYZER_DENY_CIDRS.
//
// Its flags are Smokescreen's; `egress check` is the container's health check.
package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/stripe/smokescreen/cmd"
	"github.com/stripe/smokescreen/pkg/smokescreen"
)

// allowedPorts are the only ports a scan reaches (BUILD-PLAN §13).
var allowedPorts = map[string]bool{"80": true, "443": true}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "check" {
		check()
		return
	}
	conf, err := cmd.NewConfiguration(nil, nil)
	if err != nil {
		logrus.Fatalf("Could not create configuration: %v", err)
	}
	if conf == nil {
		// --help or --version, handled by the configuration.
		return
	}

	// The server's own public address, and any range the host adds, refused like the rest.
	ranges := make([]string, 0, len(conf.DenyRanges))
	for _, rng := range conf.DenyRanges {
		ranges = append(ranges, rng.Net.String())
	}
	for _, cidr := range strings.Split(os.Getenv("ARABLYZER_DENY_CIDRS"), ",") {
		if trimmed := strings.TrimSpace(cidr); trimmed != "" {
			ranges = append(ranges, trimmed)
		}
	}
	if err := conf.SetDenyRanges(ranges); err != nil {
		logrus.Fatalf("ARABLYZER_DENY_CIDRS: %v", err)
	}

	// Every connection the proxy makes, to a site or to a proxy a client names, is dialled here,
	// after Smokescreen has vetted its address.
	conf.ProxyDialTimeout = func(ctx context.Context, network, address string, timeout time.Duration) (net.Conn, error) {
		_, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		if !allowedPorts[port] {
			return nil, fmt.Errorf("port %s is refused: Arablyzer reaches ports 80 and 443 alone", port)
		}
		dialer := net.Dialer{Timeout: timeout}
		return dialer.DialContext(ctx, network, address)
	}

	conf.Log.Formatter = &logrus.JSONFormatter{}
	log.SetOutput(&smokescreen.Log2LogrusWriter{Entry: conf.Log.WithField("stdlog", "1")})
	log.SetFlags(0)
	smokescreen.StartWithConfig(conf, nil)
}

// check exits 0 when the proxy accepts connections on its port, for the container's health.
func check() {
	port := os.Getenv("EGRESS_PORT")
	if port == "" {
		port = "4750"
	}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", port), 2*time.Second)
	if err != nil {
		os.Exit(1)
	}
	_ = conn.Close()
}
