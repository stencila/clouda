#!/bin/bash

grep "\"version\":" package.json | sed -En "s/ *\"version\": *\"([0-9]+.[0-9]+.[0-9]+)\" *, */\1/p"