import os
import shutil
import simplejson

from utils.test import TestCase
from nose.tools import eq_

from django.contrib.auth.models import User
from django.conf import settings

from jetpack.models import Module, Package, PackageRevision, SDK
from jetpack.xpi_utils import sdk_copy, xpi_build
from jetpack.cron import find_files, clean_tmp

class XPIBuildTest(TestCase):

    fixtures = ['nozilla', 'core_sdk', 'users', 'packages']

    def setUp(self):
        self.author = User.objects.get(username='john')
        self.addon = Package.objects.get(name='test-addon',
                                         author__username='john')
        self.library = Package.objects.get(name='test-library')
        self.addonrev = self.addon.latest
        self.librev = self.library.latest
        mod = Module.objects.create(
            filename='test_module',
            code='// test module',
            author=self.author
        )
        self.librev.module_add(mod)
        self.SDKDIR = self.addon.latest.get_sdk_dir()
        self.attachment_file_name = os.path.join(
                settings.UPLOAD_DIR, 'test_filename.txt')
        handle = open(self.attachment_file_name, 'w')
        handle.write('.')
        handle.close()
        # link core to the latest SDK
        self.createCore()

    def tearDown(self):
        self.deleteCore()
        if os.path.exists(self.SDKDIR):
            shutil.rmtree(self.SDKDIR)
        if os.path.exists(self.attachment_file_name):
            os.remove(self.attachment_file_name)

    def makeSDKDir(self):
        os.mkdir(self.SDKDIR)
        os.mkdir('%s/packages' % self.SDKDIR)

    def test_package_dir_generation(self):
        " test if all package dirs are created properly "
        self.makeSDKDir()
        package_dir = self.library.make_dir('%s/packages' % self.SDKDIR)
        self.failUnless(os.path.isdir(package_dir))
        self.failUnless(os.path.isdir(
            '%s/%s' % (package_dir, self.library.get_lib_dir())))

    def test_save_modules(self):
        " test if module is saved "
        self.makeSDKDir()
        package_dir = self.library.make_dir('%s/packages' % self.SDKDIR)
        self.librev.export_modules(
            '%s/%s' % (package_dir, self.library.get_lib_dir()))

        self.failUnless(os.path.isfile('%s/packages/%s/%s/%s.js' % (
                            self.SDKDIR,
                            self.library.get_unique_package_name(),
                            self.library.get_lib_dir(),
                            'test_module')))

    def test_manifest_file_creation(self):
        " test if manifest is created properly "
        self.makeSDKDir()
        package_dir = self.library.make_dir('%s/packages' % self.SDKDIR)
        self.librev.export_manifest(package_dir)
        self.failUnless(os.path.isfile('%s/package.json' % package_dir))
        handle = open('%s/package.json' % package_dir)
        manifest_json = handle.read()
        manifest = simplejson.loads(manifest_json)
        self.assertEqual(manifest, self.librev.get_manifest())

    def test_minimal_lib_export(self):
        " test if all the files are in place "
        self.makeSDKDir()
        self.librev.export_files_with_dependencies('%s/packages' % self.SDKDIR)
        package_dir = '%s/packages/%s' % (
            self.SDKDIR, self.library.get_unique_package_name())
        self.failUnless(os.path.isdir(package_dir))
        self.failUnless(os.path.isdir(
            '%s/%s' % (package_dir, self.library.get_lib_dir())))
        self.failUnless(os.path.isfile('%s/package.json' % package_dir))
        self.failUnless(os.path.isfile('%s/%s/%s.js' % (
                            package_dir,
                            self.library.get_lib_dir(),
                            'test_module')))

    def test_addon_export_with_dependency(self):
        " test if lib and main.js are properly exported "
        self.makeSDKDir()
        addon_dir = '%s/packages/%s' % (self.SDKDIR,
                                        self.addon.get_unique_package_name())
        lib_dir = '%s/packages/%s' % (self.SDKDIR,
                                      self.library.get_unique_package_name())

        self.addonrev.dependency_add(self.librev)
        self.addonrev.export_files_with_dependencies(
            '%s/packages' % self.SDKDIR)
        self.failUnless(os.path.isdir(
            '%s/%s' % (addon_dir, self.addon.get_lib_dir())))
        self.failUnless(os.path.isdir(
            '%s/%s' % (lib_dir, self.library.get_lib_dir())))
        self.failUnless(os.path.isfile(
            '%s/%s/%s.js' % (
                addon_dir,
                self.addon.get_lib_dir(),
                self.addonrev.module_main)))

    def test_addon_export_with_attachment(self):
        " test if attachment file is coped "
        self.makeSDKDir()
        # create attachment in upload dir
        handle = open(self.attachment_file_name, 'w')
        handle.write('unit test file')
        handle.close()
        addon_dir = '%s/packages/%s' % (self.SDKDIR,
                                        self.addon.get_unique_package_name())
        self.addonrev.attachment_create(
            filename='test_filename',
            ext='txt',
            path='test_filename.txt',
            author=self.author
        )
        self.addonrev.export_files_with_dependencies(
            '%s/packages' % self.SDKDIR)
        self.failUnless(os.path.isfile(self.attachment_file_name))

    def test_copying_sdk(self):
        sdk_copy(self.addonrev.sdk.get_source_dir(), self.SDKDIR)
        self.failUnless(os.path.isdir(self.SDKDIR))

    def test_minimal_xpi_creation(self):
        " xpi build from an addon straight after creation "
        sdk_copy(self.addonrev.sdk.get_source_dir(), self.SDKDIR)
        self.addonrev.export_keys(self.SDKDIR)
        self.addonrev.export_files_with_dependencies(
            '%s/packages' % self.SDKDIR)
        out = xpi_build(self.SDKDIR,
                    '%s/packages/%s' % (
                        self.SDKDIR, self.addon.get_unique_package_name()))
        # assert no error output
        self.assertEqual('', out[1])
        # assert xpi was created
        self.failUnless(os.path.isfile('%s/packages/%s/%s.xpi' % (
            self.SDKDIR, self.addon.get_unique_package_name(),
            self.addon.name)))

    def test_addon_with_other_modules(self):
        " addon has now more modules "
        self.addonrev.module_create(
            filename='test_filename',
            author=self.author
        )
        sdk_copy(self.addonrev.sdk.get_source_dir(), self.SDKDIR)
        self.addonrev.export_keys(self.SDKDIR)
        self.addonrev.export_files_with_dependencies(
            '%s/packages' % self.SDKDIR)
        out = xpi_build(self.SDKDIR,
                        '%s/packages/%s' % (
                            self.SDKDIR, self.addon.get_unique_package_name()))
        # assert no error output
        self.assertEqual('', out[1])
        self.failUnless(out[0])
        # assert xpi was created
        self.failUnless(os.path.isfile('%s/packages/%s/%s.xpi' % (
            self.SDKDIR, self.addon.get_unique_package_name(),
            self.addon.name)))

    def test_xpi_with_empty_dependency(self):
        " empty lib is created "
        lib = Package.objects.create(
            full_name='Test Library',
            author=self.author,
            type='l'
        )
        librev = PackageRevision.objects.filter(
            package__id_number=lib.id_number)[0]
        self.addonrev.dependency_add(librev)
        sdk_copy(self.addonrev.sdk.get_source_dir(), self.SDKDIR)
        self.addonrev.export_keys(self.SDKDIR)
        self.addonrev.export_files_with_dependencies(
            '%s/packages' % self.SDKDIR)
        out = xpi_build(self.SDKDIR,
                    '%s/packages/%s' % (
                        self.SDKDIR, self.addon.get_unique_package_name()))
        # assert no error output
        self.assertEqual('', out[1])
        # assert xpi was created
        self.failUnless(os.path.isfile('%s/packages/%s/%s.xpi' % (
            self.SDKDIR,
            self.addon.get_unique_package_name(), self.addon.name)))

    def test_xpi_with_dependency(self):
        " addon has one dependency with a file "
        self.addonrev.dependency_add(self.librev)
        sdk_copy(self.addonrev.sdk.get_source_dir(), self.SDKDIR)
        self.addonrev.export_keys(self.SDKDIR)
        self.addonrev.export_files_with_dependencies(
            '%s/packages' % self.SDKDIR)
        out = xpi_build(self.SDKDIR,
                    '%s/packages/%s' % (
                        self.SDKDIR, self.addon.get_unique_package_name()))
        # assert no error output
        self.assertEqual('', out[1])
        # assert xpi was created
        self.failUnless(os.path.isfile('%s/packages/%s/%s.xpi' % (
            self.SDKDIR,
            self.addon.get_unique_package_name(), self.addon.name)))

    def test_xpi_clean(self):
        """Test that we clean up the /tmp directory correctly."""
        rev = Package.objects.get(id=4).revisions.all()[0]
        sdk = SDK.objects.create(version='0.8',
                                     core_lib=rev,
                                     dir='jetpack-sdk-0.8')

        rev.sdk = sdk
        rev.save()

        # Clean out /tmp directory.
        [ shutil.rmtree(full) for full in find_files() ]
        assert not find_files()
        rev.build_xpi()

        # There should be one directory in the /tmp directory now.
        eq_(len(find_files()), 1)
        clean_tmp(length=0)
        assert not find_files()
