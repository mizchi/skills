package main

import (
	"encoding/json"
	"os"
)

type Item struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func main() {
	items := []Item{{"alpha", 3}, {"beta", 5}, {"gamma", 2}}
	f, err := os.Create(os.Args[1])
	if err != nil {
		panic(err)
	}
	defer f.Close()
	if err := json.NewEncoder(f).Encode(items); err != nil {
		panic(err)
	}
}
