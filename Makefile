install:
	npm ci
	npm run build

deploy:
	git pull --rebase origin master
	make install
