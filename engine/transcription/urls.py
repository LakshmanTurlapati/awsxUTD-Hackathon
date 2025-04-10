from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'recordings', views.AudioRecordingViewSet)
router.register(r'transcriptions', views.TranscriptionViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('upload/', views.AudioUploadView.as_view(), name='audio-upload'),
    path('upload-complete/', views.CompleteAudioUploadView.as_view(), name='complete-audio-upload'),
    path('stream/', views.StreamingTranscriptionView.as_view(), name='stream-transcription'),
    path('get-transcription/<str:recording_id>/', views.GetTranscriptionView.as_view(), name='get-transcription'),
    path('transcription/<str:recording_id>/', views.GetTranscriptionView.as_view(), name='get-transcription-alt'),
    path('finalize/<str:recording_id>/', views.FinalizeTranscriptionView.as_view(), name='finalize-transcription'),
    path('candidate/save/', views.save_candidate_view, name='save_candidate'),
    path('candidate/all/', views.get_all_candidates_view, name='get_all_candidates'),
    path('candidate/delete/<str:candidate_id>/', views.delete_candidate_view, name='delete_candidate'),
    
    # Referer endpoints
    path('referer/save/', views.save_referer_view, name='save_referer'),
    path('referer/all/', views.get_all_referers_view, name='get_all_referers'),
    path('referer/<str:referer_id>/', views.get_referer_by_id_view, name='get_referer_by_id'),
    path('referer/delete/<str:referer_id>/', views.delete_referer_view, name='delete_referer'),
    path('referer/upload-image/<str:referer_id>/', views.upload_profile_image, name='upload_profile_image'),
] 