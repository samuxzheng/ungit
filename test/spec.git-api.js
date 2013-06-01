
var expect = require('expect.js');
var request = require('supertest');
var express = require('express');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var restGit = require('../git-api');
var common = require('./common.js');
var wrapErrorHandler = common.wrapErrorHandler;

var app = express();

restGit.registerApi(app, null, true);

var testDir;
var gitConfig;

var req = request(app);

describe('git-api', function () {

	it('creating test dir should work', function(done) {
		common.post(req, '/testing/createdir', undefined, done, function(err, res) {
			expect(res.body.path).to.be.ok();
			testDir = res.body.path;
			done();
		});
	});

	it('config should return config data', function(done) {
		common.get(req, '/config', { path: testDir }, done, function(err, res) {
			expect(res.body).to.be.an('object');
			expect(res.body['user.name']).to.be.ok();
			expect(res.body['user.email']).to.be.ok();
			gitConfig = res.body;
			done();
		});
	});


	it('status should fail in uninited directory', function(done) {
		req
			.get(restGit.pathPrefix + '/status')
			.query({ path: testDir })
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(400)
			.end(wrapErrorHandler(done, function(err, res) {
				expect(res.body.errorCode).to.be('not-a-repository');
				done();
			}));
	});

	it('status should fail in non-existing directory', function(done) {
		req
			.get(restGit.pathPrefix + '/status')
			.query({ path: path.join(testDir, 'nowhere') })
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(400)
			.end(wrapErrorHandler(done));
	});

	it('init should succeed in uninited directory', function(done) {
		common.post(req, '/init', { path: testDir }, done);
	});

	it('status should succeed in inited directory', function(done) {
		common.get(req, '/status', { path: testDir }, done);
	});

	it('commit should fail on when there\'s no files to commit', function(done) {
		req
			.post(restGit.pathPrefix + '/commit')
			.send({ path: testDir, message: 'test', files: [] })
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(400)
			.end(wrapErrorHandler(done));
	});

	var testFile = 'somefile';

	it('log should be empty before first commit', function(done) {
		common.get(req, '/log', { path: testDir }, done, function(err, res) {
			expect(res.body).to.be.a('array');
			expect(res.body.length).to.be(0);
			done();
		});
	});

	it('commit should fail on non-existing file', function(done) {
		req
			.post(restGit.pathPrefix + '/commit')
			.send({ path: testDir, message: 'test', files: [testFile] })
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(400)
			.end(wrapErrorHandler(done));
	});

	it('creating test file should work', function(done) {
		common.post(req, '/testing/createfile', { file: path.join(testDir, testFile) }, done);
	});

	it('status should list untracked file', function(done) {
		common.get(req, '/status', { path: testDir }, done, function(err, res) {
			expect(Object.keys(res.body.files).length).to.be(1);
			expect(res.body.files[testFile]).to.eql({
				isNew: true,
				staged: false
			});
			done();
		});
	});

	it('diff on created file should work', function(done) {
		common.get(req, '/diff', { path: testDir, file: testFile }, done, function(err, res) {
			expect(res.body).to.be.an('array');
			expect(res.body.length).to.be.greaterThan(0);
			expect(res.body[0].lines).to.be.an('array');
			expect(res.body[0].lines.length).to.be.greaterThan(0);
			done();
		});
	});

	it('diff on non existing file should fail', function(done) {
		req
			.get(restGit.pathPrefix + '/diff')
			.query({ path: testDir, file: 'non-file.txt' })
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(400)
			.end(wrapErrorHandler(done));
	});


	var commitMessage = 'test';

	it('commit should fail without commit message', function(done) {
		req
			.post(restGit.pathPrefix + '/commit')
			.send({ path: testDir, message: undefined, files: [testFile] })
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(400)
			.end(wrapErrorHandler(done));
	});

	it('commit should succeed when there\'s files to commit', function(done) {
		common.post(req, '/commit', { path: testDir, message: commitMessage, files: [testFile] }, done);
	});

	it('log should show latest commit', function(done) {
		common.get(req, '/log', { path: testDir }, done, function(err, res) {
			expect(res.body).to.be.a('array');
			expect(res.body.length).to.be(1);
			expect(res.body[0].message.indexOf(commitMessage)).to.be(0);
			expect(res.body[0].title).to.be(commitMessage);
			expect(res.body[0].authorName).to.be(gitConfig['user.name']);
			expect(res.body[0].authorEmail).to.be(gitConfig['user.email']);
			done();
		});
	});

	it('modifying a test file should work', function(done) {
		common.post(req, '/testing/changefile', { file: path.join(testDir, testFile) }, done);
	});

	it('modified file should show up in status', function(done) {
		common.get(req, '/status', { path: testDir }, done, function(err, res) {
			expect(Object.keys(res.body.files).length).to.be(1);
			expect(res.body.files[testFile]).to.eql({
				isNew: false,
				staged: false
			});
			done();
		});
	});

	it('diff on modified file should work', function(done) {
		common.get(req, '/diff', { path: testDir, file: testFile }, done, function(err, res) {
			expect(res.body).to.be.an('array');
			expect(res.body.length).to.be.greaterThan(0);
			expect(res.body[0].lines).to.be.an('array');
			expect(res.body[0].lines.length).to.be.greaterThan(0);
			done();
		});
	});

	it('discarding changes should work', function(done) {
		common.post(req, '/discardchanges', { path: testDir, file: testFile }, done);
	});

	var testFile2 = 'my test.txt';

	it('creating a multi word test file should work', function(done) {
		common.post(req, '/testing/createfile', { file: path.join(testDir, testFile2) }, done);
	});

	it('status should list the new file', function(done) {
		common.get(req, '/status', { path: testDir }, done, function(err, res) {
			expect(Object.keys(res.body.files).length).to.be(1);
			expect(res.body.files[testFile2]).to.eql({
				isNew: true,
				staged: false
			});
			done();
		});
	});

	it('discarding the new file should work', function(done) {
		req
			.post(restGit.pathPrefix + '/discardchanges')
			.send({ path: testDir, file: testFile2 })
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200)
			.end(wrapErrorHandler(done));
	});

	it('listing branches should work', function(done) {
		common.get(req, '/branches', { path: testDir }, done, function(err, res) {
			expect(res.body.length).to.be(1);
			expect(res.body[0].name).to.be('master');
			expect(res.body[0].current).to.be(true);
			done();
		});
	});

	var testBranch = 'testBranch';

	it('creating a branch should work', function(done) {
		common.post(req, '/branches', { path: testDir, name: testBranch, startPoint: 'master' }, done);
	});

	it('listing branches should show the new branch', function(done) {
		common.get(req, '/branches', { path: testDir }, done, function(err, res) {
			expect(res.body.length).to.be(2);
			expect(res.body[0].name).to.be('master');
			expect(res.body[0].current).to.be(true);
			expect(res.body[1].name).to.be(testBranch);
			expect(res.body[1].current).to.be(undefined);
			done();
		});
	});

	it('should be possible to switch to a branch', function(done) {
		common.post(req, '/branch', { path: testDir, name: testBranch }, done);
	});

	it('listing branches should show the new branch as current', function(done) {
		common.get(req, '/branches', { path: testDir }, done, function(err, res) {
			expect(res.body.length).to.be(2);
			expect(res.body[0].name).to.be('master');
			expect(res.body[0].current).to.be(undefined);
			expect(res.body[1].name).to.be(testBranch);
			expect(res.body[1].current).to.be(true);
			done();
		});
	});

	it('get branch should show the new branch as current', function(done) {
		common.get(req, '/branch', { path: testDir }, done, function(err, res) {
			expect(res.body).to.be(testBranch);
			done();
		});
	});


	var testSubDir = 'sub';

	it('creating test sub dir should work', function(done) {
		common.post(req, '/testing/createsubdir', { dir: path.join(testDir, testSubDir) }, done);
	});

	var testFile3 = path.join(testSubDir, 'testy.txt').replace('\\', '/');

	it('creating a test file in sub dir should work', function(done) {
		common.post(req, '/testing/createfile', { file: path.join(testDir, testFile3) }, done);
	});

	it('status should list the new file', function(done) {
		common.get(req, '/status', { path: testDir }, done, function(err, res) {
			expect(Object.keys(res.body.files).length).to.be(1);
			expect(res.body.files[testFile3]).to.eql({
				isNew: true,
				staged: false
			});
			done();
		});
	});

	var commitMessage3 = 'commit3';

	it('commit should succeed with file in sub dir', function(done) {
		common.post(req, '/commit', { path: testDir, message: commitMessage3, files: [testFile3] }, done);
	});

	it('log should show both branches and all commits', function(done) {
		common.get(req, '/log', { path: testDir }, done, function(err, res) {
			expect(res.body).to.be.a('array');
			expect(res.body.length).to.be(2);
			var objs = {};
			res.body.forEach(function(obj) {
				obj.refs.sort();
				objs[obj.refs[0]] = obj;
			});
			var master = objs['refs/heads/master'];
			var HEAD = objs['HEAD'];
			expect(master.message.indexOf(commitMessage)).to.be(0);
			expect(master.title).to.be(commitMessage);
			expect(master.authorDate).to.be.a('string');
			expect(master.authorName).to.be(gitConfig['user.name']);
			expect(master.authorEmail).to.be(gitConfig['user.email']);
			expect(master.commitDate).to.be.a('string');
			expect(master.committerName).to.be(gitConfig['user.name']);
			expect(master.committerEmail).to.be(gitConfig['user.email']);
			expect(master.refs).to.eql(['refs/heads/master']);
			expect(master.parents).to.eql([]);
			expect(master.sha1).to.be.ok();

			expect(HEAD.message.indexOf(commitMessage3)).to.be(0);
			expect(HEAD.title).to.be(commitMessage3);
			expect(HEAD.authorDate).to.be.a('string');
			expect(HEAD.authorName).to.be(gitConfig['user.name']);
			expect(HEAD.authorEmail).to.be(gitConfig['user.email']);
			expect(HEAD.commitDate).to.be.a('string');
			expect(HEAD.committerName).to.be(gitConfig['user.name']);
			expect(HEAD.committerEmail).to.be(gitConfig['user.email']);
			expect(HEAD.refs).to.eql(['HEAD', 'refs/heads/' + testBranch]);
			expect(HEAD.parents).to.eql([master.sha1]);
			expect(HEAD.sha1).to.be.ok();
			done();
		});
	});

	it('cleaning up test dir should work', function(done) {
		common.post(req, '/testing/cleanup', undefined, done);
	});


})