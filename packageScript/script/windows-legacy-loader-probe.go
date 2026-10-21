//go:build windows

package main

/*
#include <stdlib.h>
*/
import "C"

import (
	"crypto/rand"
	"fmt"
	"net"
	"os"
	"os/exec"
	"syscall"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "child" {
		return
	}
	memory := C.malloc(16)
	if memory == nil {
		panic("CGO allocation failed")
	}
	C.free(memory)
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		panic(err)
	}
	library, err := syscall.LoadDLL("advapi32.dll")
	if err != nil {
		panic(err)
	}
	if _, err := library.FindProc("SystemFunction036"); err != nil {
		panic(err)
	}
	if err := library.Release(); err != nil {
		panic(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	if err := listener.Close(); err != nil {
		panic(err)
	}
	self, err := os.Executable()
	if err != nil {
		panic(err)
	}
	if err := exec.Command(self, "child").Run(); err != nil {
		panic(err)
	}
	fmt.Println("DLL 加载、随机源、CGO、监听及子进程检查通过")
}
