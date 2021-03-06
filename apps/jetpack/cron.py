import os
import shutil
import stat
import time

from django.conf import settings

import commonware
import cronjobs

length = 60 * 60 * 24 # one day
log = commonware.log.getLogger('z.cron')


def find_files():
    files = []
    tmp_dir = os.path.dirname(settings.SDKDIR_PREFIX)
    for filename in os.listdir(tmp_dir):
        full = os.path.join(tmp_dir, filename)

        if full.startswith(settings.SDKDIR_PREFIX):
            files.append(full)
    return files


@cronjobs.register
def clean_tmp(length=length):
    older = time.time() - length
    for filename in find_files():
        if (os.stat(filename)[stat.ST_MTIME] < older):
            shutil.rmtree(filename)
            log.info('Deleted: %s' % filename)
