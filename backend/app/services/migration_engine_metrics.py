    async def _record_metrics(self, start_time: datetime, files_count: int, bytes_count: int, errors: int):
        """Record performance metrics for live monitoring."""
        elapsed_seconds = (datetime.utcnow() - start_time).total_seconds()
        
        if elapsed_seconds > 0:
            files_per_minute = (files_count / elapsed_seconds) * 60
            bytes_per_second = bytes_count / elapsed_seconds
        else:
            files_per_minute = 0
            bytes_per_second = 0
        
        # Get current stage counts
        stage_counts_response = self.supabase.table('migration_items').select('status').eq('job_id', self.job_id).execute()
        stage_counts = {}
        for item in stage_counts_response.data:
            status = item['status']
            stage_counts[status] = stage_counts.get(status, 0) + 1
        
        metrics_data = {
            'job_id': self.job_id,
            'files_per_minute': files_per_minute,
            'bytes_per_second': bytes_per_second,
            'error_count': errors,
            'api_throttle_count': 0,  # TODO: Track actual throttles
            'stage_counts': stage_counts,
            'recorded_at': datetime.utcnow().isoformat()
        }
        
        self.supabase.table('migration_metrics').insert(metrics_data).execute()
        logger.info(f"📊 Metrics: {files_per_minute:.1f} files/min, {bytes_per_second/1024:.1f} KB/s")
