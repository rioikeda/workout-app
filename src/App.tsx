import { useEffect, useState } from 'react';
import './App.css';
import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import Auth from './components/Auth';
import homeHeroImage from './assets/home-hero.png';
import type { Exercise, Preset } from './types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
type WorkoutRecord = {
  id: number;
  exercise: string;
  weight: number;
  reps: number;
  sets: number;
  set_number: number;
  date: string;
  workout_session_id?: number | null;
};
type PresetWithExercises = Preset & {
  preset_exercises?: {
    exercise_id: number;
  }[];
};
const calculateEstimated1RM = (weight: number, reps: number) => {
  return weight * (1 + reps / 30);
};
function App() {
  const [exercise, setExercise] = useState('');
  const [analyticsExercise, setAnalyticsExercise] = useState('');
  const [historyMonth, setHistoryMonth] = useState(new Date());
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [currentSet, setCurrentSet] = useState(1);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [exerciseSetCounts, setExerciseSetCounts] = useState<Record<number, number>>({});
  const [previousSets, setPreviousSets] = useState<WorkoutRecord[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [presets, setPresets] = useState<PresetWithExercises[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [selectedPresetExercises, setSelectedPresetExercises] = useState<Exercise[]>([]);
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetExerciseIds, setNewPresetExerciseIds] = useState<number[]>([]);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [isAddingExercise, setIsAddingExercise] = useState(false);
  const [extraWorkoutExercises, setExtraWorkoutExercises] = useState<{
    id: number;
    name: string;
  }[]>([]);
  const [completedExerciseIds, setCompletedExerciseIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState<'home' | 'workout' | 'history' | 'analytics'>(() => {
    const savedPage = localStorage.getItem('currentPage');
    if (savedPage === 'home' ||
      savedPage === 'workout' ||
      savedPage === 'history' ||
      savedPage === 'analytics') {
      return savedPage;
    }
    return 'home';
  });
  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);
  const [showWorkoutSummary, setShowWorkoutSummary] = useState(false);
  const [sessionPrCount, setSessionPrCount] = useState(0);
  const [workoutSummary, setWorkoutSummary] = useState({
    volume: 0,
    exercises: 0,
    sets: 0,
    prCount: 0,
  });
  const currentExercise = exercises.find((exerciseItem) => exerciseItem.name === exercise);
  const loadExercises = async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, body_part, user_id')
      .order('name');
    if (error) {
      alert('種目の読み込みエラー: ' + error.message);
      return;
    }
    setExercises(data ?? []);
  };
  const loadPresets = async () => {
    const { data: { user }, } = await supabase.auth.getUser();
    if (!user) {
      setPresets([]);
      return;
    }
    const { data, error } = await supabase
      .from('presets')
      .select('id, user_id, name, preset_exercises(exercise_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) {
      alert('プリセット読み込みエラー: ' + error.message);
      return;
    }
    setPresets(data ?? []);
  };
  const loadPresetExercises = async (presetId: number) => {
    const { data, error } = await supabase
      .from('preset_exercises')
      .select(`
      exercise_id,
      sort_order,
      exercises (
        id,
        name,
        body_part,
        user_id
      )
    `)
      .eq('preset_id', presetId)
      .order('sort_order', { ascending: true });
    if (error) {
      alert('プリセット種目の読み込みエラー: ' + error.message);
      return;
    }
    const exerciseList: Exercise[] =
      data?.flatMap((item) => item.exercises ?? []) ?? []

    setSelectedPresetExercises(exerciseList)
  };
  const removeExtraExercise = (exerciseId: number) => {
    setExtraWorkoutExercises((prev) => prev.filter((exerciseItem) => exerciseItem.id !== exerciseId));
  };
  const deletePreset = async (presetId: number) => {
    const ok = window.confirm('このプリセットを削除しますか？');
    if (!ok)
      return;
    const { error: exerciseError } = await supabase
      .from('preset_exercises')
      .delete()
      .eq('preset_id', presetId);
    if (exerciseError) {
      alert('プリセット種目の削除エラー: ' + exerciseError.message);
      return;
    }
    const { error: presetError } = await supabase
      .from('presets')
      .delete()
      .eq('id', presetId);
    if (presetError) {
      alert('プリセット削除エラー: ' + presetError.message);
      return;
    }
    if (selectedPresetId === presetId) {
      setSelectedPresetId(null);
      setSelectedPresetExercises([]);
    }
    await loadPresets();
  };
  const addPreset = async () => {
    if (!newPresetName.trim()) {
      alert('プリセット名を入力してね');
      return;
    }
    const { data: { user }, } = await supabase.auth.getUser();
    if (!user) {
      alert('先にログインしてね');
      return;
    }
    const { data: newPreset, error } = await supabase
      .from('presets')
      .insert({
        user_id: user.id,
        name: newPresetName.trim(),
      })
      .select('id')
      .single();
    if (error) {
      alert('プリセット保存エラー: ' + error.message);
      return;
    }
    if (newPresetExerciseIds.length > 0) {
      const presetExercises = newPresetExerciseIds.map((exerciseId, index) => ({
        preset_id: newPreset.id,
        exercise_id: exerciseId,
        sort_order: index + 1,
      }));
      const { error: exerciseError } = await supabase
        .from('preset_exercises')
        .insert(presetExercises);
      if (exerciseError) {
        alert('種目の保存エラー: ' + exerciseError.message);
        return;
      }
    }
    setNewPresetName('');
    setNewPresetExerciseIds([]);
    setIsAddingPreset(false);
    await loadPresets();
  };
  const addRecord = async () => {
    if (!exercise || !weight || !reps) {
      alert('全部入力してね');
      return;
    }
    const exerciseRecords = records.filter((record) => record.exercise === exercise);
    const previousBestEstimated1RM = exerciseRecords.reduce((max, record) => Math.max(max, calculateEstimated1RM(record.weight, record.reps)), 0);
    const currentEstimated1RM = calculateEstimated1RM(Number(weight), Number(reps));
    const isNewPR = previousBestEstimated1RM > 0 &&
      currentEstimated1RM > previousBestEstimated1RM;
    if (isNewPR) {
      setSessionPrCount((count) => count + 1);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('先にログインしてね');
      return;
    }
    const { data: newWorkout, error } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        workout_session_id: currentSessionId,
        exercise: exercise,
        weight: Number(weight),
        reps: Number(reps),
        sets: 1,
        set_number: currentSet,
        date: new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single();
    if (error) {
      alert('保存エラー: ' + error.message);
      return;
    }
    if (currentSessionId && currentExercise) {
      const { error: setError } = await supabase
        .from('workout_sets')
        .insert({
          workout_session_id: currentSessionId,
          workout_id: newWorkout.id,
          exercise_id: currentExercise.id,
          set_number: currentSet,
          weight: Number(weight),
          reps: Number(reps),
        });
      if (setError) {
        alert('セット保存エラー: ' + setError.message);
        return;
      }
    }
    await loadRecords();
    if (isNewPR) {
      alert(`🎉 PR更新！ ${exercise}\n${weight}kg × ${reps}回\n推定1RM：${currentEstimated1RM.toFixed(1)}kg`);
    }
    setReps('');
    if (currentExercise) {
      setExerciseSetCounts((prev) => ({
        ...prev,
        [currentExercise.id]: (prev[currentExercise.id] ?? 0) + 1,
      }));
      setCurrentSet((prev) => prev + 1);
    }
  };
  const loadPreviousSets = async (exerciseName: string) => {
    const { data: { user }, } = await supabase.auth.getUser();
    if (!user || !exerciseName) {
      setPreviousSets([]);
      return;
    }
    const { data, error } = await supabase
      .from('workouts')
      .select('id, exercise, weight, reps, sets, set_number, date')
      .eq('user_id', user.id)
      .eq('exercise', exerciseName)
      .order('date', { ascending: false })
      .order('set_number', { ascending: true });
    if (error) {
      alert('前回記録の読み込みエラー: ' + error.message);
      return;
    }
    if (!data || data.length === 0) {
      setPreviousSets([]);
      return;
    }
    const previousDate = data[0].date;
    setPreviousSets(data.filter((record) => record.date === previousDate));
  };
  const createWorkoutSession = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('ログイン情報が取得できません');
      return null;
    }
    const { data, error } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: user.id,
        workout_date: new Date().toISOString().split('T')[0],
        preset_id: selectedPresetId,
      })
      .select('id')
      .single();
    if (error) {
      alert('トレーニング開始エラー: ' + error.message);
      return null;
    }
    setCurrentSessionId(data.id);
    return data.id;
  };
  const finishWorkoutSession = async () => {
    if (!currentSessionId)
      return;
    const currentSessionRecords = records.filter((record) => record.workout_session_id === currentSessionId);
    const currentSessionVolume = currentSessionRecords.reduce((total, record) => total + record.weight * record.reps, 0);
    const previousSessionIds = [
      ...new Set(records
        .map((record) => record.workout_session_id)
        .filter((sessionId): sessionId is number => sessionId !== null &&
          sessionId !== undefined &&
          sessionId !== currentSessionId)),
    ];
    const previousBestVolume = previousSessionIds.reduce((best, sessionId) => {
      const volume = records
        .filter((record) => record.workout_session_id === sessionId)
        .reduce((total, record) => total + record.weight * record.reps, 0);
      return Math.max(best, volume);
    }, 0);
    const { error } = await supabase
      .from('workout_sessions')
      .update({
        ended_at: new Date().toISOString(),
      })
      .eq('id', currentSessionId);
    if (error) {
      alert('トレーニング終了エラー: ' + error.message);
      return;
    }
    if (previousBestVolume > 0 &&
      currentSessionVolume > previousBestVolume) {
      alert(`🏆 合計ボリュームPR！\n${currentSessionVolume.toLocaleString()}kg\n過去最高：${previousBestVolume.toLocaleString()}kg`);
    }
    setCurrentSessionId(null);
  };
  const loadActiveWorkoutSession = async () => {
    const { data: { user }, } = await supabase.auth.getUser();
    if (!user)
      return;
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('id, preset_id, completed_exercise_ids, current_exercise_id')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      alert('進行中トレーニングの読み込みエラー: ' + error.message);
      return;
    }
    if (data) {
      setCurrentSessionId(data.id);
      setIsWorkoutActive(true);
      setCompletedExerciseIds(data.completed_exercise_ids ?? []);
      if (data.preset_id) {
        setSelectedPresetId(data.preset_id);
        await loadPresetExercises(data.preset_id);
      }
      const { data: savedSets, error: setsError } = await supabase
        .from('workout_sets')
        .select('exercise_id')
        .eq('workout_session_id', data.id);
      if (setsError) {
        alert('セット復元エラー: ' + setsError.message);
        return;
      }
      const counts: Record<number, number> = {};
      savedSets?.forEach((set) => {
        counts[set.exercise_id] = (counts[set.exercise_id] ?? 0) + 1;
      });
      setExerciseSetCounts(counts);
      if (data.current_exercise_id) {
        const { data: currentExercise, error: exerciseError } = await supabase
          .from('exercises')
          .select('id, name')
          .eq('id', data.current_exercise_id)
          .single();
        if (exerciseError) {
          alert('選択中の種目の復元エラー: ' + exerciseError.message);
        }
        else if (currentExercise) {
          setExercise(currentExercise.name);
          await loadPreviousSets(currentExercise.name);
          setCurrentSet((counts[currentExercise.id] ?? 0) + 1);
        }
      }
    }
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRecords([]);
    alert('ログアウトしたよ');
  };
  const loadRecords = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRecords([]);
      return;
    }
    const { data, error } = await supabase
      .from('workouts')
      .select('id, exercise, weight, reps, sets, date, set_number, workout_session_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      alert('読み込みエラー: ' + error.message);
      return;
    }
    setRecords(data ?? []);
  };
  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session }, } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadRecords();
        await loadExercises();
        await loadPresets();
        await loadActiveWorkoutSession();
      }
    };
    initializeAuth();
  }, []);
  const deleteRecord = async (id: number) => {
    const { error: setDeleteError } = await supabase
      .from('workout_sets')
      .delete()
      .eq('workout_id', id);
    if (setDeleteError) {
      alert('セット削除エラー: ' + setDeleteError.message);
      return;
    }
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', id);
    if (error) {
      alert('削除エラー: ' + error.message);
      return;
    }
    setRecords((prev) => prev.filter((record) => record.id !== id));
  };
  const personalBest = records
    .filter((record) => record.exercise === exercise)
    .reduce((max, record) => Math.max(max, record.weight), 0);
  const bestEstimated1RM = records
    .filter((record) => record.exercise === exercise)
    .reduce((max, record) => Math.max(max, calculateEstimated1RM(record.weight, record.reps)), 0);
  const previousCurrentSet = previousSets.find((record) => record.set_number === currentSet);
  const weightDifference = previousCurrentSet && weight
    ? Number(weight) - previousCurrentSet.weight
    : 0;
  const repsDifference = previousCurrentSet && reps
    ? Number(reps) - previousCurrentSet.reps
    : 0;
  const analyticsChartData = Object.values(records
    .filter((record) => record.exercise === analyticsExercise)
    .reduce<Record<string, WorkoutRecord>>((acc, record) => {
      const current = acc[record.date];
      if (!current || record.weight > current.weight) {
        acc[record.date] = record;
      }
      return acc;
    }, {}))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((record) => ({
      date: record.date,
      weight: record.weight,
      estimated1RM: calculateEstimated1RM(record.weight, record.reps),
    }));
  const analyticsRecords = records.filter((record) => record.exercise === analyticsExercise);
  const analyticsMaxWeight = analyticsRecords.reduce((max, record) => Math.max(max, record.weight), 0);
  const analyticsMaxEstimated1RM = analyticsRecords.reduce((max, record) => Math.max(max, calculateEstimated1RM(record.weight, record.reps)), 0);
  const analyticsRecordCount = new Set(analyticsRecords.map((record) => record.date)).size;
  const historyYear = historyMonth.getFullYear();
  const historyMonthIndex = historyMonth.getMonth();
  const daysInHistoryMonth = new Date(historyYear, historyMonthIndex + 1, 0).getDate();
  const firstDayOfHistoryMonth = new Date(historyYear, historyMonthIndex, 1).getDay();
  const historyCalendarDays = Array.from({ length: firstDayOfHistoryMonth + daysInHistoryMonth }, (_, index) => {
    if (index < firstDayOfHistoryMonth) {
      return null;
    }
    return index - firstDayOfHistoryMonth + 1;
  });
  const groupedRecords = records.reduce<Record<string, WorkoutRecord[]>>((groups, record) => {
    const key = record.workout_session_id
      ? `session-${record.workout_session_id}`
      : `${record.date}-${record.exercise}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(record);
    return groups;
  }, {});
  return (<div className={`app-shell page-${currentPage}`}>
    <div className="app-header">
      <div>
        <p className="app-eyebrow">TRAINING LOG</p>
        <h1>Workout.</h1>
      </div>

      {user && (<button className="logout-button" onClick={signOut}>
        Logout
      </button>)}
    </div>


    {showWorkoutSummary && (<div className="workout-summary">
      <span className="summary-label">WORKOUT COMPLETE</span>

      <h2>トレーニング完了</h2>

      <div className="summary-main">
        <span>合計ボリューム</span>
        <strong>{workoutSummary.volume.toLocaleString()} kg</strong>
      </div>
      <div className="summary-stats">
        <div>
          <span>EXERCISES</span>
          <strong>{workoutSummary.exercises}</strong>
        </div>

        <div>
          <span>SETS</span>
          <strong>{workoutSummary.sets}</strong>
        </div>
      </div>
      {workoutSummary.prCount > 0 && (<div className="summary-pr">
        <span>NEW PR</span>
        <strong>{workoutSummary.prCount}</strong>
      </div>)}
      <button className="summary-close-button" onClick={() => {
        setShowWorkoutSummary(false);
        setSessionPrCount(0);
        setCurrentPage('home');
      }}>
        完了
      </button>
    </div>)}


    {!user && (<Auth onLogin={async () => {
      const { data: { user }, } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        await loadRecords();
        await loadExercises();
        await loadPresets();
      }
    }} />)}
    {user && currentPage === 'home' && <div className="home-page-content">
      <div className="home-hero">
        <img src={homeHeroImage} alt="" style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'fill',
          zIndex: 999,
        }} />

        <p className="home-hero-copy">
          LIFT
          <br />
          RECORD
          <br />
          IMPROVE
        </p>
      </div>
      <div className="preset-header">
        <div>
          <p className="section-label">PRESETS</p>
          <h2>いつものメニュー</h2>
        </div>
      </div>

      {presets.length === 0 ? (<p>まだプリセットがありません</p>) : (<div className="preset-grid">
        {presets.map((preset) => (<div className={selectedPresetId === preset.id
          ? 'preset-card preset-card-active'
          : 'preset-card'} key={preset.id} onClick={() => {
            setSelectedPresetId(preset.id);
            loadPresetExercises(preset.id);
            setCurrentPage('workout');
          }}>
          <div className="preset-card-info">
            <span className="preset-card-name">{preset.name}</span>
            <span className="preset-card-count">
              {preset.preset_exercises?.length ?? 0} exercises
            </span>
          </div>
          <button type="button" className="preset-delete-button" onClick={(e) => {
            e.stopPropagation();
            deletePreset(preset.id);
          }}>
            ×
          </button>
          <span className="preset-card-arrow">↗</span>
        </div>))}
      </div>)}
      <button className="add-preset-button" onClick={() => setIsAddingPreset((prev) => !prev)}>
        {isAddingPreset ? '× 閉じる' : '＋ 新しいプリセット'}
      </button>
      {!isWorkoutActive && (<div className="quick-start">
        <p className="section-label">QUICK START</p>
        <h2>自由に始める</h2>

        <button type="button" className="free-workout-button" onClick={async () => {
          const { data: { user }, } = await supabase.auth.getUser();
          if (!user)
            return;
          const { data, error } = await supabase
            .from('workout_sessions')
            .insert({
              user_id: user.id,
              preset_id: null,
            })
            .select('id')
            .single();
          if (error) {
            alert('フリーワークアウト開始エラー: ' + error.message);
            return;
          }
          setCurrentSessionId(data.id);
          setIsWorkoutActive(true);
          setCurrentPage('workout');
          setSessionPrCount(0);
          setSelectedPresetId(null);
          setSelectedPresetExercises([]);
          setExtraWorkoutExercises([]);
          setCompletedExerciseIds([]);
          setExerciseSetCounts({});
          setExercise('');
          setWeight('');
          setReps('');
          setCurrentSet(1);
        }}>
          フリーワークアウトを開始
        </button>

      </div>)}
      {isAddingPreset && (<div className="preset-form">
        <input type="text" placeholder="プリセット名" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} />

        <p>種目を選択</p>
        <div className="preset-exercise-list">
          {exercises.map((exerciseItem) => (<label key={exerciseItem.id}>
            <input type="checkbox" value={exerciseItem.id} checked={newPresetExerciseIds.includes(exerciseItem.id)} onChange={(e) => {
              if (e.target.checked) {
                setNewPresetExerciseIds([
                  ...newPresetExerciseIds,
                  exerciseItem.id,
                ]);
              }
              else {
                setNewPresetExerciseIds(newPresetExerciseIds.filter((id) => id !== exerciseItem.id));
              }
            }} />
            <span>{exerciseItem.name}</span>
          </label>))}
        </div>
        <button onClick={addPreset}>
          保存
        </button>
      </div>)}
    </div>}
    {currentPage === 'workout' && (<div className="workout-page">
      {(selectedPresetId !== null || isWorkoutActive) && (<div className="selected-preset">
        <p className="selected-preset-label">WORKOUT</p>

        {selectedPresetExercises.length === 0 &&
          extraWorkoutExercises.length === 0 ? (<p>
            {selectedPresetId === null
              ? '種目を追加して始めよう'
              : 'このプリセットにはまだ種目がありません'}
          </p>) : (<div className="selected-preset-exercises">
            {selectedPresetExercises.map((exerciseItem, index) => (<button className={`selected-preset-exercise ${completedExerciseIds.includes(exerciseItem.id)
              ? 'selected-preset-exercise-completed'
              : exercise === exerciseItem.name
                ? 'selected-preset-exercise-active'
                : ''}`} key={exerciseItem.id} onClick={async () => {
                  if (!isWorkoutActive)
                    return;
                  setExercise(exerciseItem.name);
                  loadPreviousSets(exerciseItem.name);
                  setCurrentSet((exerciseSetCounts[exerciseItem.id] ?? 0) + 1);
                  if (currentSessionId) {
                    const { error } = await supabase
                      .from('workout_sessions')
                      .update({
                        current_exercise_id: exerciseItem.id,
                      })
                      .eq('id', currentSessionId);
                    if (error) {
                      alert('選択中の種目の保存エラー: ' + error.message);
                    }
                  }
                }}>
              <span className="exercise-number">
                {String(index + 1).padStart(2, '0')}
              </span>

              <span className="selected-exercise-name">
                {exerciseItem.name}
              </span>

              {isWorkoutActive && (<span className="exercise-status">
                {completedExerciseIds.includes(exerciseItem.id)
                  ? '✓'
                  : exercise === exerciseItem.name
                    ? '●'
                    : ''}
              </span>)}
            </button>))}
            {extraWorkoutExercises.map((exerciseItem, index) => (<button className={completedExerciseIds.includes(exerciseItem.id)
              ? 'selected-preset-exercise selected-preset-exercise-completed'
              : exercise === exerciseItem.name
                ? 'selected-preset-exercise selected-preset-exercise-active'
                : 'selected-preset-exercise'} key={`extra-${exerciseItem.id}`} onClick={async () => {
                  if (!isWorkoutActive)
                    return;
                  setExercise(exerciseItem.name);
                  loadPreviousSets(exerciseItem.name);
                  setCurrentSet((exerciseSetCounts[exerciseItem.id] ?? 0) + 1);
                  if (currentSessionId) {
                    const { error } = await supabase
                      .from('workout_sessions')
                      .update({
                        current_exercise_id: exerciseItem.id,
                      })
                      .eq('id', currentSessionId);
                    if (error) {
                      alert('選択中の種目の保存エラー: ' + error.message);
                    }
                  }
                }}>
              <span className="exercise-number">
                {String(selectedPresetExercises.length + index + 1).padStart(2, '0')}
              </span>

              <span className="selected-exercise-name">
                {exerciseItem.name}
              </span>

              {isWorkoutActive && (<div className="exercise-status-area">
                <span className="exercise-status">
                  {completedExerciseIds.includes(exerciseItem.id)
                    ? '✓'
                    : exercise === exerciseItem.name
                      ? '●'
                      : ''}
                </span>

                <button type="button" className="remove-extra-exercise" onClick={(e) => {
                  e.stopPropagation();
                  removeExtraExercise(exerciseItem.id);
                }}>
                  ×
                </button>
              </div>)}
            </button>))}
          </div>)}
      </div>)}
      {selectedPresetId !== null && selectedPresetExercises.length > 0 && (!isWorkoutActive ? (<button className="start-workout-button" onClick={async () => {
        const sessionId = await createWorkoutSession();
        if (sessionId === null)
          return;
        setIsWorkoutActive(true);
        setCurrentPage('workout');
        setSessionPrCount(0);
        setCompletedExerciseIds([]);
        setExerciseSetCounts({});
        setCurrentSet(1);
        setExercise('');
        setWeight('');
        setReps('');
      }}>
        このプリセットで開始
      </button>) : null)}

      {isWorkoutActive && (<div className="workout-input">
        <div className="add-exercise-area">
          <button type="button" className="add-exercise-button" onClick={() => setIsAddingExercise((prev) => !prev)}>
            {isAddingExercise ? '× 閉じる' : '＋ 種目を追加'}
          </button>

          {isAddingExercise && (<select className="other-exercise-select" value={exercise} onChange={async (e) => {
            const selectedName = e.target.value;
            setExercise(selectedName);
            loadPreviousSets(selectedName);
            setIsAddingExercise(false);
            const selectedExercise = exercises.find((exerciseItem) => exerciseItem.name === selectedName);
            if (selectedExercise &&
              !selectedPresetExercises.some((exerciseItem) => exerciseItem.id === selectedExercise.id) &&
              !extraWorkoutExercises.some((exerciseItem) => exerciseItem.id === selectedExercise.id)) {
              setExtraWorkoutExercises((prev) => [
                ...prev,
                selectedExercise,
              ]);
            }
            if (selectedExercise) {
              setCurrentSet((exerciseSetCounts[selectedExercise.id] ?? 0) + 1);
              if (currentSessionId) {
                const { error } = await supabase
                  .from('workout_sessions')
                  .update({
                    current_exercise_id: selectedExercise.id,
                  })
                  .eq('id', currentSessionId);
                if (error) {
                  alert('選択中の種目の保存エラー: ' + error.message);
                }
              }
            }
            else {
              setCurrentSet(1);
            }
          }}>
            <option value="">種目を選択</option>

            {exercises.map((exerciseItem) => (<option key={exerciseItem.id} value={exerciseItem.name}>
              {exerciseItem.name}
            </option>))}
          </select>)}
        </div>
        {exercise && (<div className="current-exercise-header">
          <span>CURRENT EXERCISE</span>
          <strong>{exercise}</strong>
        </div>)}
        <div className="set-header">
          <span>SET</span>
          <strong>{String(currentSet).padStart(2, '0')}</strong>
        </div>
        <div className="workout-values">
          <label className="workout-value">
            <span>WEIGHT</span>

            <div className="value-input">
              <input type="number" placeholder="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
              <small>kg</small>
            </div>
            {previousCurrentSet && (<small className="previous-inline">
              前回 {previousCurrentSet.weight}kg
              {weightDifference > 0 && (<span className="growth-value">
                ＋{weightDifference}kg
              </span>)}
            </small>)}
          </label>

          <label className="workout-value">
            <span>REPS</span>

            <div className="value-input">
              <input type="number" placeholder="0" value={reps} onChange={(e) => setReps(e.target.value)} />
              <small>reps</small>
            </div>
            {previousCurrentSet && (<small className="previous-inline">
              前回 {previousCurrentSet.reps}回
              {repsDifference > 0 && (<span className="growth-value">
                ＋{repsDifference}回
              </span>)}
            </small>)}
          </label>
        </div>


        {previousSets.length > 0 && (<div className="previous-section">

          <p className="previous-records-label">
            PREVIOUS {previousSets[0]?.date?.replaceAll('-', '/')}
          </p>

          <div className="previous-records">
            {previousSets.map((record) => (<button type="button" className="previous-record" key={record.id} onClick={() => {
              setWeight(String(record.weight));
              setReps(String(record.reps));
            }}>
              <span>SET {String(record.set_number).padStart(2, '0')}</span>
              <strong>{record.weight}kg × {record.reps}</strong>
            </button>))}
          </div>

        </div>)}

        {personalBest > 0 && (<p className="workout-stat">BEST {personalBest}kg</p>)}

        {bestEstimated1RM > 0 && (<p className="workout-stat">
          EST. 1RM {bestEstimated1RM.toFixed(1)}kg
        </p>)}

        <button className="save-set-button" onClick={addRecord}>
          記録する
        </button>
        {isWorkoutActive && exercise !== '' && (<button className="complete-exercise-button" onClick={async () => {
          const selectedExercise = exercises.find((exerciseItem) => exerciseItem.name === exercise);
          if (!selectedExercise)
            return;
          const newCompletedIds = completedExerciseIds.includes(selectedExercise.id)
            ? completedExerciseIds.filter((id) => id !== selectedExercise.id)
            : [...completedExerciseIds, selectedExercise.id];
          setCompletedExerciseIds(newCompletedIds);
          if (currentSessionId) {
            const { error } = await supabase
              .from('workout_sessions')
              .update({
                completed_exercise_ids: newCompletedIds,
              })
              .eq('id', currentSessionId);
            if (error) {
              alert('完了状態の保存エラー: ' + error.message);
            }
          }
        }}>
          {currentExercise &&
            completedExerciseIds.includes(currentExercise.id)
            ? '完了を取り消す'
            : 'この種目を完了'}
        </button>)}
      </div>)}
      {isWorkoutActive && (<button className="finish-workout-button" onClick={async () => {
        const { data: sessionSets } = await supabase
          .from('workout_sets')
          .select('weight, reps, exercise_id')
          .eq('workout_session_id', currentSessionId);
        const totalVolume = (sessionSets ?? []).reduce((total, set) => total + Number(set.weight) * Number(set.reps), 0);
        const totalSets = sessionSets?.length ?? 0;
        const totalExercises = new Set((sessionSets ?? []).map((set) => set.exercise_id)).size;
        setWorkoutSummary({
          volume: totalVolume,
          exercises: totalExercises,
          sets: totalSets,
          prCount: sessionPrCount,
        });
        await finishWorkoutSession();
        setShowWorkoutSummary(true);
        setIsWorkoutActive(false);
        setSelectedPresetId(null);
        setExercise('');
        setWeight('');
        setReps('');
        setCurrentSet(1);
        setCompletedExerciseIds([]);
        setExerciseSetCounts({});
      }}>
        トレーニング終了
      </button>)}


      {!isWorkoutActive && selectedPresetId === null && (<div className="empty-page-state">
        <p className="section-label">WORKOUT</p>
        <h2>メニューを選んで始めよう</h2>
        <p>HOMEでプリセットを選ぶか、フリーワークアウトを開始してね。</p>
        <button type="button" onClick={() => setCurrentPage('home')}>
          HOMEへ
        </button>
      </div>)}
    </div>)}

    {currentPage === 'analytics' && (<div className="analytics-page">
      <select className="analytics-exercise-select" value={analyticsExercise} onChange={(e) => setAnalyticsExercise(e.target.value)}>
        <option value="">種目を選択</option>

        {exercises.map((exerciseItem) => (<option key={exerciseItem.id} value={exerciseItem.name}>
          {exerciseItem.name}
        </option>))}
      </select>
      {analyticsExercise && analyticsChartData.length > 0 && (<div>
        <div className="analytics-chart-heading">
          <span>PROGRESS</span>
          <h2>{analyticsExercise}</h2>
        </div>

        <div className="analytics-stats">
          <div className="analytics-stat-card">
            <span>MAX WEIGHT</span>
            <strong>{analyticsMaxWeight} kg</strong>
          </div>

          <div className="analytics-stat-card">
            <span>EST. 1RM</span>
            <strong>{analyticsMaxEstimated1RM.toFixed(1)} kg</strong>
          </div>

          <div className="analytics-stat-card">
            <span>RECORDS</span>
            <strong>{analyticsRecordCount}</strong>
          </div>
        </div>
        <div className="analytics-chart-card">
          <ResponsiveContainer>
            <LineChart data={analyticsChartData}>
              <XAxis dataKey="date" tick={{ fill: '#8d8f87', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8d8f87', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{
                background: '#1a1b18',
                border: 'none',
                borderRadius: '12px',
                color: '#f4f3ee',
              }} labelStyle={{
                color: '#8d8f87',
              }} />
              <Legend wrapperStyle={{
                fontSize: '12px',
                color: '#8d8f87',
                paddingTop: '12px',
              }} />
              <Line type="monotone" dataKey="weight" name="実重量" stroke="#d7ff63" strokeWidth={3} />
              <Line type="monotone" dataKey="estimated1RM" name="推定1RM" stroke="#f4f3ee" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>)}
      {analyticsExercise && analyticsChartData.length === 0 && (<div className="empty-page-state">
        <p className="section-label">ANALYTICS</p>
        <h2>まだ記録がありません</h2>
        <p>
          {analyticsExercise}を記録すると、ここに重量と推定1RMの推移が表示されるよ。
        </p>
      </div>)}
      {!analyticsExercise && (<div className="empty-page-state">
        <p className="section-label">ANALYTICS</p>
        <h2>分析する種目を選ぼう</h2>
        <p>トレーニングで種目を選ぶと、ここに重量と推定1RMの推移が表示されるよ。</p>
      </div>)}
    </div>)}

    {currentPage === 'history' && (<div className="history-page">
      <div className="history-calendar">
        <div className="history-calendar-header">
          <button onClick={() => setHistoryMonth(new Date(historyYear, historyMonthIndex - 1, 1))}>
            ‹
          </button>

          <strong>
            {historyYear}年 {historyMonthIndex + 1}月
          </strong>

          <button onClick={() => setHistoryMonth(new Date(historyYear, historyMonthIndex + 1, 1))}>
            ›
          </button>
        </div>
        <div className="history-calendar-weekdays">
          <span>日</span>
          <span>月</span>
          <span>火</span>
          <span>水</span>
          <span>木</span>
          <span>金</span>
          <span>土</span>
        </div>
        <div className="history-calendar-grid">
          {historyCalendarDays.map((day, index) => {
            if (!day) {
              return <div key={index} className="history-calendar-day" />;
            }
            const dateString = `${historyYear}-${String(historyMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasWorkout = records.some((record) => record.date === dateString);
            const today = new Date();
            const isToday = today.getFullYear() === historyYear &&
              today.getMonth() === historyMonthIndex &&
              today.getDate() === day;
            return (<div key={dateString} className={`history-calendar-day ${hasWorkout ? 'has-workout' : ''} ${selectedHistoryDate === dateString ? 'selected' : ''} ${isToday ? 'today' : ''}`} onClick={() => setSelectedHistoryDate(dateString)}>
              <span>{day}</span>

              {hasWorkout && (<span className="history-calendar-dot" />)}
            </div>);
          })}
        </div>
      </div>
      <div className="history-header">
        <div>
          <p className="section-label">HISTORY</p>
          <h2 className="history-title">
            {selectedHistoryDate
              ? `${Number(selectedHistoryDate.slice(5, 7))}月${Number(selectedHistoryDate.slice(8, 10))}日の記録`
              : '日付を選択'}
          </h2>
        </div>
      </div>

      {records.length === 0 && <p>まだ記録がありません</p>}

      {Object.entries(groupedRecords)
        .filter(([, group]) => selectedHistoryDate &&
          group.some((record) => record.date === selectedHistoryDate))
        .map(([key, group]) => {
          const firstRecord = group[0];
          const sessionVolume = group.reduce((total, record) => total + record.weight * record.reps, 0);
          const recordsByExercise = group.reduce<Record<string, WorkoutRecord[]>>((exerciseGroups, record) => {
            if (!exerciseGroups[record.exercise]) {
              exerciseGroups[record.exercise] = [];
            }
            exerciseGroups[record.exercise].push(record);
            return exerciseGroups;
          }, {});
          return (<div key={key} className="history-card">
            <div className="history-card-header">
              <span>{firstRecord.date}</span>
              <strong>{sessionVolume.toLocaleString()} kg</strong>
            </div>

            {Object.entries(recordsByExercise).map(([exerciseName, exerciseRecords]) => {
              const sortedExerciseRecords = [...exerciseRecords].sort((a, b) => a.set_number - b.set_number);
              return (<div key={exerciseName}>
                <h3>{exerciseName}</h3>

                {sortedExerciseRecords.map((record) => (<div key={record.id} className="history-set">
                  <span>
                    {record.set_number}セット目　{record.weight}kg × {record.reps}回
                  </span>

                  <button onClick={() => deleteRecord(record.id)}>
                    削除
                  </button>
                </div>))}
              </div>);
            })}
          </div>);
        })}
    </div>)}
    {user && (<nav className="bottom-nav">
      <button className={currentPage === 'home' ? 'active' : ''} onClick={() => setCurrentPage('home')}>
        HOME
      </button>

      <button className={currentPage === 'workout' ? 'active' : ''} onClick={() => setCurrentPage('workout')}>
        WORKOUT
      </button>

      <button className={currentPage === 'history' ? 'active' : ''} onClick={() => setCurrentPage('history')}>
        HISTORY
      </button>

      <button className={currentPage === 'analytics' ? 'active' : ''} onClick={() => setCurrentPage('analytics')}>
        ANALYTICS
      </button>
    </nav>)}
  </div>);
}
export default App;
