// The egress proxy of Arablyzer's containers (M2.1 plan §5b): Smokescreen, which resolves every
// name itself and refuses the addresses the egress package refuses (smokescreen.yaml), with two
// additions of Arablyzer's own. It dials ports 80 and 443 alone (BUILD-PLAN §13), and it refuses
// the server's own public address, from ARABLYZER_DENY_CIDRS, without which it will not start.
//
// Its flags are Smokescreen's; `egress check` is the container's health check.
package main

import (
	"context"
	"errors"
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

// denyVariable names the server's own public address, and any range the host adds.
const denyVariable = "ARABLYZER_DENY_CIDRS"

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
	if err := denyServer(conf, os.Getenv(denyVariable)); err != nil {
		logrus.Fatalf("%s: %v", denyVariable, err)
	}
	conf.ProxyDialTimeout = dialAllowed
	conf.Log.Formatter = &logrus.JSONFormatter{}
	log.SetOutput(&smokescreen.Log2LogrusWriter{Entry: conf.Log.WithField("stdlog", "1")})
	log.SetFlags(0)
	smokescreen.StartWithConfig(conf, nil)
}

// denyServer adds the ranges of ARABLYZER_DENY_CIDRS, comma-separated, to those the
// configuration refuses. The server's own public address is one, so there must be one: behind
// NAT, the proxy cannot see it (BUILD-PLAN §18.3.1).
func denyServer(conf *smokescreen.Config, value string) error {
	var ranges []string
	for _, cidr := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(cidr); trimmed != "" {
			ranges = append(ranges, trimmed)
		}
	}
	if len(ranges) == 0 {
		return errors.New("name the server's own public address, as a CIDR (203.0.113.7/32)")
	}
	// Smokescreen adds these to the ranges it already refuses.
	return conf.SetDenyRanges(ranges)
}

// portAllowed refuses every port but 80 and 443.
func portAllowed(address string) error {
	_, port, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	if !allowedPorts[port] {
		return fmt.Errorf("port %s is refused: Arablyzer reaches ports 80 and 443 alone", port)
	}
	return nil
}

// dialAllowed dials every connection the proxy makes, to a site or to a proxy a client names,
// after Smokescreen has vetted its address: on ports 80 and 443 alone.
func dialAllowed(ctx context.Context, network, address string, timeout time.Duration) (net.Conn, error) {
	if err := portAllowed(address); err != nil {
		return nil, err
	}
	dialer := net.Dialer{Timeout: timeout}
	return dialer.DialContext(ctx, network, address)
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
