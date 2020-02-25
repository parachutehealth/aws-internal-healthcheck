#!/usr/bin/env bash

rm -f healthcheck-function.zip

zip -r healthcheck-function.zip index.js internal.crt node_modules

